// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import "../src/Stovia.sol";
import "../src/ValidatedPriceFeed.sol";

interface Vm {
    function deal(address, uint256) external;
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function warp(uint256) external;
    function expectRevert() external;
    function targetContract(address) external;
}

contract MockStock is ERC20 {
    bool public oraclePaused;

    function setOraclePaused(bool p) external {
        oraclePaused = p;
    }
    constructor() ERC20("Local stock mock", "MOCK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockOracle {
    int256 public answer = 2500e8;
    uint256 public at;
    uint80 public answered = 1;

    constructor() {
        at = block.timestamp;
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function set(int256 a, uint256 time, uint80 round) external {
        answer = a;
        at = time;
        answered = round;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, at, at, answered);
    }
}

contract MockEligibility {
    function supportsAsset(address) external pure returns (bool) {
        return true;
    }
    mapping(address => bool) public denied;

    function deny(address who, bool d) external {
        denied[who] = d;
    }

    function eligible(address who, address) external view returns (bool) {
        return !denied[who];
    }
}

contract ProtocolTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    StockRegistry registry;
    FeeVault vault;
    LaunchFactory factory;
    MockStock stock;
    MockOracle stockOracle;
    MockOracle ethOracle;
    MockEligibility eligibility;
    StockMarket market;
    address token;
    address creator = address(0xCAFE);
    address trader = address(0xBEEF);
    address treasury = address(0xFEE);
    receive() external payable {}

    function setUp() public virtual {
        vm.warp(100000);
        registry = new StockRegistry(address(this), address(this));
        vault = new FeeVault(address(this), treasury);
        stock = new MockStock();
        stockOracle = new MockOracle();
        stockOracle.set(100e8, block.timestamp, 1);
        ethOracle = new MockOracle();
        eligibility = new MockEligibility();
        registry.review(
            address(stock),
            StockRegistry.Asset(
                address(stockOracle),
                address(eligibility),
                3600,
                18,
                true,
                false,
                keccak256("local mock evidence"),
                50e18,
                200e18
            )
        );
        factory = new LaunchFactory(registry, vault, treasury, address(ethOracle), 3600, address(this));
        vault.grantRole(vault.REGISTRAR_ROLE(), address(factory));
        vm.deal(creator, 10 ether);
        vm.deal(address(this), 100 ether);
        uint256 cost = factory.creationFee();
        vm.prank(creator);
        (address t, address m) =
            factory.launch{value: cost}("Local launch", "TEST", 1e27, address(stock), 5, "ipfs://local-metadata");
        token = t;
        market = StockMarket(m);
        stock.mint(trader, 1000000e18);
        vm.prank(trader);
        stock.approve(m, type(uint256).max);
    }

    function buy(uint256 amount) internal {
        vm.prank(trader);
        market.buy(amount, 0, block.timestamp + 60);
    }

    function testCreationFeeAndImmutableSupply() public view {
        require(factory.creationFee() == 0.0001 ether);
        require(treasury.balance == 0.0001 ether);
        require(IERC20(token).totalSupply() == 1e27);
        require(market.feePercent() == 5);
        require(factory.officialMarket(address(market)));
    }

    function testFeeDistributionAndClaim() public {
        buy(100e18);
        require(stock.balanceOf(treasury) == 0.5e18);
        require(vault.getClaimableFees(creator, token) == 4.5e18);
        vm.prank(trader);
        vault.claimFor(creator, token);
        require(stock.balanceOf(creator) == 4.5e18);
        vm.expectRevert();
        vault.claimFor(creator, token);
    }

    function testCannotRedirectClaim() public {
        buy(100e18);
        vm.prank(trader);
        vm.expectRevert();
        vault.claimFees(token);
    }

    function testBuySellSolvency() public {
        buy(100e18);
        uint256 tokens = IERC20(token).balanceOf(trader);
        vm.startPrank(trader);
        IERC20(token).approve(address(market), tokens);
        market.sell(tokens, 0, block.timestamp + 60);
        vm.stopPrank();
        require(stock.balanceOf(address(market)) == market.realQuote());
        require(market.curveSold() == 0);
    }

    function testSlippageAndDeadline() public {
        vm.startPrank(trader);
        vm.expectRevert();
        market.buy(100e18, type(uint256).max, block.timestamp + 60);
        vm.expectRevert();
        market.buy(100e18, 0, block.timestamp - 1);
        vm.stopPrank();
    }

    function testInsufficientStock() public {
        vm.prank(address(0x123));
        vm.expectRevert();
        market.buy(100e18, 0, block.timestamp + 60);
    }

    function testInvalidStockAndInsufficientETH() public {
        vm.prank(creator);
        vm.expectRevert();
        factory.launch{value: 0}("Bad", "BAD", 1e27, address(stock), 1, "");
        vm.prank(creator);
        vm.expectRevert();
        factory.launch{value: 1 ether}("Bad", "BAD", 1e27, address(0x123), 1, "");
    }

    function testInvalidFee() public {
        vm.prank(creator);
        vm.expectRevert();
        factory.launch{value: 1 ether}("Bad", "BAD", 1e27, address(stock), 11, "");
    }

    function testUnauthorizedRegistry() public {
        vm.prank(trader);
        vm.expectRevert();
        registry.suspend(address(stock), true);
    }

    function testSuspension() public {
        registry.suspend(address(stock), true);
        vm.prank(trader);
        vm.expectRevert();
        market.buy(100e18, 0, block.timestamp + 60);
    }

    function testRestrictedTransferEligibility() public {
        eligibility.deny(trader, true);
        vm.prank(trader);
        vm.expectRevert();
        market.buy(100e18, 0, block.timestamp + 60);
    }

    function testStaleAndNegativeOracle() public {
        stockOracle.set(100e8, block.timestamp - 3601, 1);
        vm.prank(trader);
        vm.expectRevert();
        market.buy(100e18, 0, block.timestamp + 60);
        stockOracle.set(-1, block.timestamp, 1);
        vm.prank(trader);
        vm.expectRevert();
        market.buy(100e18, 0, block.timestamp + 60);
    }

    function testPriceDeviation() public {
        stockOracle.set(1000e8, block.timestamp, 1);
        vm.prank(trader);
        vm.expectRevert();
        market.buy(100e18, 0, block.timestamp + 60);
    }

    function testUnauthorizedFeeAccrual() public {
        vm.prank(trader);
        vm.expectRevert();
        vault.accrue(token, 100);
    }

    function testETHRouteUnavailable() public {
        PaymentRouter router = new PaymentRouter(factory, registry, address(this));
        vm.expectRevert();
        router.buyWithETH{value: 1 ether}(address(market), 0, 0, block.timestamp + 60);
    }

    function testPrematureGraduation() public {
        vm.expectRevert();
        market.graduate();
    }

    function testGraduationAndAMM() public {
        uint256 net = 500e18;
        uint256 gross = (net * 100) / 95;
        buy(gross);
        require(market.graduationEligible());
        market.graduate();
        require(market.graduated());
        require(market.ammToken() > 0);
        uint256 supplyBefore = IERC20(token).totalSupply();
        buy(10e18);
        vm.startPrank(trader);
        IERC20(token).approve(address(market), type(uint256).max);
        market.sell(IERC20(token).balanceOf(trader) / 10, 0, block.timestamp + 60);
        vm.stopPrank();
        require(IERC20(token).totalSupply() == supplyBefore);
        require(stock.balanceOf(address(market)) == market.realQuote());
    }

    function testFuzzRoundTrip(uint96 amount, uint8 chosenFee) public {
        uint256 gross = uint256(amount) % 100e18 + 100;
        buy(gross);
        uint256 input = IERC20(token).balanceOf(trader);
        vm.startPrank(trader);
        IERC20(token).approve(address(market), input);
        market.sell(input, 0, block.timestamp + 60);
        vm.stopPrank();
        require(stock.balanceOf(address(market)) == market.realQuote());
        require(stock.balanceOf(trader) <= 1000000e18);
        chosenFee;
    }

    function testETHRouterSuccessAndRefund() public {
        PaymentRouter router = new PaymentRouter(factory, registry, address(this));
        MockAdapter adapter = new MockAdapter(stock);
        router.approveRoute(address(stock), address(adapter), keccak256("LOCAL MOCK ROUTE"));
        uint256 beforeETH = address(this).balance;
        uint256 out = router.buyWithETH{value: 1 ether}(address(market), 1e18, 1, block.timestamp + 60);
        require(out > 0 && IERC20(token).balanceOf(address(this)) == out);
        require(address(this).balance == beforeETH - 0.8 ether);
        require(address(router).balance == 0);
        require(stock.allowance(address(router), address(market)) == 0);
    }

    function testETHRouterMinimumOutputAndDeadline() public {
        PaymentRouter router = new PaymentRouter(factory, registry, address(this));
        MockAdapter adapter = new MockAdapter(stock);
        router.approveRoute(address(stock), address(adapter), keccak256("LOCAL MOCK ROUTE"));
        vm.expectRevert();
        router.buyWithETH{value: 1 ether}(address(market), 100e18, 1, block.timestamp + 60);
        vm.expectRevert();
        router.buyWithETH{value: 1 ether}(address(market), 1, 1, block.timestamp - 1);
    }

    function testOracleWrapperSequencerAndPause() public {
        MockOracle uptime = new MockOracle();
        uptime.set(0, block.timestamp - 7200, 1);
        ValidatedPriceFeed feed = new ValidatedPriceFeed(
            IAggregator(address(stockOracle)), IAggregator(address(uptime)), address(stock), 3600
        );
        (, int256 answer,,,) = feed.latestRoundData();
        require(answer == 100e8);
        uptime.set(1, block.timestamp - 7200, 1);
        vm.expectRevert();
        feed.latestRoundData();
        uptime.set(0, block.timestamp, 1);
        vm.expectRevert();
        feed.latestRoundData();
        uptime.set(0, block.timestamp - 7200, 1);
        stock.setOraclePaused(true);
        vm.expectRevert();
        feed.latestRoundData();
    }
}

contract MarketHandler {
    StockMarket public market;
    MockStock public stock;
    address public token;

    constructor(StockMarket m, MockStock s) {
        market = m;
        stock = s;
        token = m.token();
        s.approve(address(m), type(uint256).max);
        IERC20(token).approve(address(m), type(uint256).max);
    }

    function buy(uint96 raw) external {
        uint256 amount = uint256(raw) % 10e18 + 1000;
        stock.mint(address(this), amount);
        try market.buy(amount, 0, block.timestamp + 1) {} catch {}
    }

    function sell(uint96 raw) external {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance == 0) return;
        uint256 amount = uint256(raw) % balance + 1;
        try market.sell(amount, 0, block.timestamp + 1) {} catch {}
    }

    function graduate() external {
        try market.graduate() {} catch {}
    }
}

contract SolvencyInvariantTest is ProtocolTest {
    MarketHandler handler;

    function setUp() public override {
        super.setUp();
        handler = new MarketHandler(market, stock);
    }

    function targetContracts() public view returns (address[] memory result) {
        result = new address[](1);
        result[0] = address(handler);
    }

    function invariant_RealReservesAlwaysBacked() public view {
        require(stock.balanceOf(address(market)) >= market.realQuote());
    }

    function invariant_FixedSupply() public view {
        require(IERC20(token).totalSupply() == 1e27);
    }

    function invariant_CurveAccounting() public view {
        if (!market.graduated()) {
            require(market.y() == market.realQuote() + market.virtualQuoteInitial());
            require(market.x() + market.curveSold() == market.supply());
        }
    }
}

contract MockAdapter is IConversionAdapter {
    MockStock public immutable stock;

    constructor(MockStock s) {
        stock = s;
    }

    function quoteExactInput(address, uint256 ethIn, address) external pure returns (uint256, uint256) {
        return (ethIn * 10, 0);
    }

    function convert(address, address recipient, uint256, uint256) external payable returns (uint256) {
        uint256 out = msg.value * 10;
        stock.mint(recipient, out);
        (bool ok,) = msg.sender.call{value: msg.value / 5}("");
        require(ok);
        return out;
    }
}
