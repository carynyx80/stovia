// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface IAggregator {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

interface IEligibility {
    function eligible(address account, address asset) external view returns (bool);
}

/// @notice Governance must be an independently configured multisig/timelock. Onchain checks cannot certify legal authenticity.
contract StockRegistry is AccessControl {
    bytes32 public constant REVIEWER_ROLE = keccak256("REVIEWER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    struct Asset {
        address oracle;
        address eligibility;
        uint64 maxAge;
        uint8 decimals;
        bool approved;
        bool suspended;
        bytes32 evidenceHash;
        uint256 minPrice;
        uint256 maxPrice;
    }
    mapping(address => Asset) public assets;
    event StockReviewed(address indexed asset, bytes32 evidenceHash, bool approved);
    event Suspension(address indexed asset, bool suspended);

    constructor(address governance, address guardian) {
        require(governance != address(0) && guardian != address(0), "governance");
        _grantRole(DEFAULT_ADMIN_ROLE, governance);
        _grantRole(REVIEWER_ROLE, governance);
        _grantRole(PAUSER_ROLE, guardian);
    }

    function review(address stock, Asset calldata a) external onlyRole(REVIEWER_ROLE) {
        require(stock.code.length > 0 && a.oracle.code.length > 0 && a.eligibility.code.length > 0, "contracts");
        require(
            a.evidenceHash != 0 && a.maxAge > 0 && a.maxAge <= 1 days && a.minPrice > 0 && a.maxPrice > a.minPrice,
            "review"
        );
        require(a.decimals <= 18 && IERC20Metadata(stock).decimals() == a.decimals, "decimals");
        require(IAggregator(a.oracle).decimals() <= 18, "oracle decimals");
        assets[stock] = a;
        emit StockReviewed(stock, a.evidenceHash, a.approved);
    }

    function suspend(address stock, bool value) external {
        if (value) require(hasRole(REVIEWER_ROLE, msg.sender) || hasRole(PAUSER_ROLE, msg.sender), "pauser");
        else _checkRole(REVIEWER_ROLE, msg.sender);
        assets[stock].suspended = value;
        emit Suspension(stock, value);
    }

    function requireEligible(address stock, address who) external view {
        Asset memory a = assets[stock];
        require(a.approved && !a.suspended, "stock unavailable");
        require(IEligibility(a.eligibility).eligible(who, stock), "ineligible");
    }

    function price(address stock) public view returns (uint256 p, uint8 d) {
        Asset memory a = assets[stock];
        require(a.approved && !a.suspended, "stock unavailable");
        p = Oracle.read(a.oracle, a.maxAge);
        require(p >= a.minPrice && p <= a.maxPrice, "price deviation");
        d = a.decimals;
    }

    function valueUSD(address stock, uint256 amount) external view returns (uint256) {
        (uint256 p, uint8 d) = price(stock);
        return Math.mulDiv(amount, p, 10 ** d);
    }
}

library Oracle {
    // All USD prices returned in 18 decimals; round completeness and timestamps fail closed.
    function read(address feed, uint256 maxAge) internal view returns (uint256) {
        (uint80 round, int256 answer,, uint256 at, uint80 answered) = IAggregator(feed).latestRoundData();
        require(
            answer > 0 && at > 0 && at <= block.timestamp && block.timestamp - at <= maxAge && answered >= round,
            "oracle invalid"
        );
        uint8 d = IAggregator(feed).decimals();
        require(d <= 18, "oracle decimals");
        return uint256(answer) * 10 ** (18 - d);
    }
}

contract LaunchToken is ERC20 {
    constructor(string memory n, string memory s, uint256 supply, address recipient) ERC20(n, s) {
        require(supply > 0 && recipient != address(0), "supply");
        _mint(recipient, supply);
    }
}

contract FeeVault is ReentrancyGuard, AccessControl {
    using SafeERC20 for IERC20;
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    struct Account {
        address creator;
        address quote;
        address market;
        uint256 generated;
        uint256 claimed;
    }
    mapping(address => Account) public accounts;
    address public immutable treasury;
    event FeesAccrued(address indexed token, uint256 creatorAmount, uint256 protocolAmount);
    event FeesClaimed(address indexed creator, address indexed token, uint256 amount);

    constructor(address governance, address t) {
        require(t != address(0), "treasury");
        treasury = t;
        _grantRole(DEFAULT_ADMIN_ROLE, governance);
    }

    function register(address token, address creator, address quote, address market) external onlyRole(REGISTRAR_ROLE) {
        require(accounts[token].creator == address(0) && creator != address(0) && market != address(0), "registered");
        accounts[token] = Account(creator, quote, market, 0, 0);
    }

    function accrue(address token, uint256 amount) external nonReentrant {
        Account storage a = accounts[token];
        require(msg.sender == a.market, "market");
        uint256 beforeBalance = IERC20(a.quote).balanceOf(address(this));
        IERC20(a.quote).safeTransferFrom(msg.sender, address(this), amount);
        require(IERC20(a.quote).balanceOf(address(this)) - beforeBalance == amount, "transfer tax");
        uint256 protocol = amount / 10;
        a.generated += amount - protocol;
        IERC20(a.quote).safeTransfer(treasury, protocol);
        emit FeesAccrued(token, amount - protocol, protocol);
    }

    function getClaimableFees(address creator, address token) public view returns (uint256) {
        Account memory a = accounts[token];
        return a.creator == creator ? a.generated - a.claimed : 0;
    }

    function claimFees(address token) external nonReentrant {
        _claim(msg.sender, token);
    }

    function claimFor(address creator, address token) external nonReentrant {
        _claim(creator, token);
    }

    function claimMultiple(address[] calldata tokens) external nonReentrant {
        require(tokens.length <= 100, "batch");
        for (uint256 i; i < tokens.length; ++i) {
            _claim(msg.sender, tokens[i]);
        }
    }

    function _claim(address creator, address token) internal {
        Account storage a = accounts[token];
        require(a.creator == creator, "creator");
        uint256 amount = a.generated - a.claimed;
        require(amount > 0, "no fees");
        a.claimed += amount;
        IERC20(a.quote).safeTransfer(creator, amount);
        emit FeesClaimed(creator, token, amount);
    }
}

/// @notice One immutable market handles the curve and permanent AMM atomically. Initial liquidity is permanently protocol locked; no external LP claims exist.
contract StockMarket is ReentrancyGuard {
    using SafeERC20 for IERC20;
    StockRegistry public immutable registry;
    FeeVault public immutable vault;
    address public immutable token;
    address public immutable quote;
    address public immutable creator;
    address public immutable factory;
    uint256 public immutable supply;
    uint256 public immutable virtualTokenInitial;
    uint256 public immutable virtualQuoteInitial;
    uint256 public immutable targetUSD;
    uint8 public immutable feePercent;
    uint256 public x;
    uint256 public y;
    uint256 public realQuote;
    uint256 public curveSold;
    uint256 public ammToken;
    bool public graduated;
    bool public initialized;
    event Buy(address indexed trader, uint256 grossQuote, uint256 tokensOut, uint256 fee, bool amm);
    event Sell(address indexed trader, uint256 tokensIn, uint256 netQuote, uint256 fee, bool amm);
    event Graduation(uint256 quoteReserve, uint256 tokenReserve, uint256 burned);

    constructor(
        StockRegistry r,
        FeeVault v,
        address t,
        address q,
        address c,
        uint8 f,
        uint256 s,
        uint256 vq,
        uint256 target
    ) {
        require(f >= 1 && f <= 10 && s > 0 && vq > 0 && target > 0, "parameters");
        registry = r;
        vault = v;
        token = t;
        quote = q;
        creator = c;
        feePercent = f;
        supply = s;
        virtualTokenInitial = s;
        virtualQuoteInitial = vq;
        x = s;
        y = vq;
        targetUSD = target;
        factory = msg.sender;
    }

    function initialize() external {
        require(
            msg.sender == factory && !initialized && IERC20(token).balanceOf(address(this)) == supply, "initialization"
        );
        registry.requireEligible(quote, address(this));
        initialized = true;
        IERC20(quote).forceApprove(address(vault), type(uint256).max);
    }

    function _check(address trader, uint256 deadline) internal view {
        require(initialized && block.timestamp <= deadline, "deadline");
        registry.requireEligible(quote, trader);
        registry.requireEligible(quote, address(this));
        registry.price(quote);
    }

    function quoteBuy(uint256 gross) public view returns (uint256 out, uint256 fee) {
        fee = Math.mulDiv(gross, feePercent, 100);
        uint256 net = gross - fee;
        out = graduated ? Math.mulDiv(ammToken, net, realQuote + net) : Math.mulDiv(x, net, y + net);
    }

    function quoteSell(uint256 input) public view returns (uint256 net, uint256 fee) {
        uint256 gross = graduated ? Math.mulDiv(realQuote, input, ammToken + input) : Math.mulDiv(y, input, x + input);
        fee = Math.mulDiv(gross, feePercent, 100);
        net = gross - fee;
    }

    function buy(uint256 gross, uint256 minOut, uint256 deadline) external nonReentrant returns (uint256 out) {
        _check(msg.sender, deadline);
        uint256 fee;
        (out, fee) = quoteBuy(gross);
        require(out > 0 && out >= minOut, "slippage");
        if (!graduated) require(curveSold + out <= supply * 80 / 100, "curve allocation");
        uint256 beforeBalance = IERC20(quote).balanceOf(address(this));
        IERC20(quote).safeTransferFrom(msg.sender, address(this), gross);
        require(IERC20(quote).balanceOf(address(this)) - beforeBalance == gross, "transfer tax");
        realQuote += gross - fee;
        if (graduated) {
            ammToken -= out;
        } else {
            x -= out;
            y += gross - fee;
            curveSold += out;
        }
        vault.accrue(token, fee);
        IERC20(token).safeTransfer(msg.sender, out);
        emit Buy(msg.sender, gross, out, fee, graduated);
    }

    function sell(uint256 input, uint256 minOut, uint256 deadline) external nonReentrant returns (uint256 net) {
        _check(msg.sender, deadline);
        require(input > 0, "zero");
        uint256 fee;
        (net, fee) = quoteSell(input);
        uint256 gross = net + fee;
        require(net > 0 && net >= minOut && gross <= realQuote, "solvency or slippage");
        if (!graduated) require(input <= curveSold, "sold supply");
        IERC20(token).safeTransferFrom(msg.sender, address(this), input);
        realQuote -= gross;
        if (graduated) {
            ammToken += input;
        } else {
            x += input;
            y -= gross;
            curveSold -= input;
        }
        vault.accrue(token, fee);
        IERC20(quote).safeTransfer(msg.sender, net);
        emit Sell(msg.sender, input, net, fee, graduated);
    }

    function graduationEligible() public view returns (bool) {
        return !graduated && realQuote > 0 && registry.valueUSD(quote, realQuote) >= targetUSD;
    }

    function graduate() external nonReentrant {
        _check(address(this), type(uint256).max);
        require(graduationEligible(), "milestone");
        uint256 stock = realQuote;
        uint256 allocation = Math.mulDiv(stock, x, y);
        uint256 available = IERC20(token).balanceOf(address(this));
        require(allocation > 0 && allocation <= available, "allocation");
        graduated = true;
        ammToken = allocation;
        uint256 unused = available - allocation;
        IERC20(token).safeTransfer(address(0x000000000000000000000000000000000000dEaD), unused);
        emit Graduation(stock, allocation, unused);
    }
}

contract LaunchFactory is ReentrancyGuard, AccessControl {
    using SafeERC20 for IERC20;
    StockRegistry public immutable registry;
    FeeVault public immutable vault;
    address public immutable treasury;
    address public immutable ethOracle;
    uint256 public immutable oracleMaxAge;
    uint256 public immutable targetUSD = 50_000e18;
    mapping(address => address) public marketOf;
    mapping(address => bool) public officialMarket;
    event LaunchCreated(
        address indexed token,
        address indexed market,
        address indexed creator,
        address quote,
        uint8 feePercent,
        uint256 supply,
        string metadataURI
    );

    constructor(StockRegistry r, FeeVault v, address t, address o, uint256 age, address governance) {
        require(t != address(0) && o.code.length > 0 && age > 0, "config");
        registry = r;
        vault = v;
        treasury = t;
        ethOracle = o;
        oracleMaxAge = age;
        _grantRole(DEFAULT_ADMIN_ROLE, governance);
    }

    function creationFee() public view returns (uint256) {
        return Math.ceilDiv(0.25e18 * 1e18, Oracle.read(ethOracle, oracleMaxAge));
    }

    function launch(
        string calldata name,
        string calldata symbol,
        uint256 supply,
        address quote,
        uint8 fee,
        string calldata metadataURI
    ) external payable nonReentrant returns (address token, address market) {
        require(
            bytes(name).length > 0 && bytes(name).length <= 48 && bytes(symbol).length >= 2
                && bytes(symbol).length <= 10,
            "identity"
        );
        require(supply == 1e24 || supply == 1e25 || supply == 1e26 || supply == 1e27, "supply preset");
        registry.requireEligible(quote, msg.sender);
        (uint256 price, uint8 d) = registry.price(quote);
        uint256 cost = creationFee();
        require(msg.value >= cost, "creation fee");
        // x0=S; at 80% sold y=5y0. Real quote=4y0; graduation at target requires y0=targetQuote/4.
        uint256 targetQuote = Math.mulDiv(targetUSD, 10 ** d, price);
        uint256 vq = Math.ceilDiv(targetQuote, 4);
        require(vq > 0, "calibration");
        LaunchToken t = new LaunchToken(name, symbol, supply, address(this));
        StockMarket m = new StockMarket(registry, vault, address(t), quote, msg.sender, fee, supply, vq, targetUSD);
        token = address(t);
        market = address(m);
        marketOf[token] = market;
        officialMarket[market] = true;
        vault.register(token, msg.sender, quote, market);
        t.transfer(market, supply);
        m.initialize();
        (bool paid,) = treasury.call{value: cost}("");
        require(paid, "treasury transfer");
        if (msg.value > cost) {
            (bool refunded,) = msg.sender.call{value: msg.value - cost}("");
            require(refunded, "refund");
        }
        emit LaunchCreated(token, market, msg.sender, quote, fee, supply, metadataURI);
    }
}

interface IConversionAdapter {
    function quoteExactInput(address stock, uint256 ethIn, address recipient)
        external
        view
        returns (uint256 stockOut, uint256 routingFee);
    function convert(address stock, address recipient, uint256 minOut, uint256 deadline)
        external
        payable
        returns (uint256);
}

contract PaymentRouter is ReentrancyGuard, AccessControl {
    using SafeERC20 for IERC20;
    LaunchFactory public immutable factory;
    StockRegistry public immutable registry;
    mapping(address => address) public adapters;
    event RouteApproved(address indexed stock, address adapter, bytes32 evidence);

    constructor(LaunchFactory f, StockRegistry r, address governance) {
        factory = f;
        registry = r;
        _grantRole(DEFAULT_ADMIN_ROLE, governance);
    }

    function approveRoute(address stock, address adapter, bytes32 evidence) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(adapter.code.length > 0 && evidence != 0, "route review");
        registry.price(stock);
        adapters[stock] = adapter;
        emit RouteApproved(stock, adapter, evidence);
    }

    function buyWithETH(address market, uint256 minStock, uint256 minTokens, uint256 deadline)
        external
        payable
        nonReentrant
        returns (uint256 out)
    {
        require(factory.officialMarket(market) && msg.value > 0 && block.timestamp <= deadline, "market or deadline");
        StockMarket m = StockMarket(market);
        address stock = m.quote();
        registry.requireEligible(stock, msg.sender);
        registry.requireEligible(stock, address(this));
        address adapter = adapters[stock];
        require(adapter != address(0), "ETH route unavailable");
        uint256 beforeBalance = IERC20(stock).balanceOf(address(this));
        uint256 beforeETH = address(this).balance - msg.value;
        IConversionAdapter(adapter).convert{value: msg.value}(stock, address(this), minStock, deadline);
        uint256 got = IERC20(stock).balanceOf(address(this)) - beforeBalance;
        require(got >= minStock && got > 0, "conversion output");
        IERC20(stock).forceApprove(market, got);
        out = m.buy(got, minTokens, deadline);
        IERC20(stock).forceApprove(market, 0);
        IERC20(m.token()).safeTransfer(msg.sender, out);
        uint256 refund = address(this).balance - beforeETH;
        if (refund > 0) {
            (bool ok,) = msg.sender.call{value: refund}("");
            require(ok, "refund");
        }
    }
    receive() external payable {}
}
