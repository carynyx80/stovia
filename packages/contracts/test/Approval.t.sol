// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import "./Protocol.t.sol";
import "../src/ReviewedEligibility.sol";
import "../src/RegistryBootstrap.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

contract ThresholdMock {
    function getThreshold() external pure returns (uint256) {
        return 2;
    }
}

contract ApprovalTest is ProtocolTest {
    function testRegistryRejectsStaleOracleAtApproval() public {
        stockOracle.set(100e8, block.timestamp - 3601, 1);
        vm.expectRevert();
        registry.review(
            address(stock),
            StockRegistry.Asset(
                address(stockOracle), address(eligibility), 3600, 18, true, false, keccak256("review"), 50e18, 200e18
            )
        );
    }

    function testEligibilityRequiresScopedUnexpiredAttestation() public {
        ReviewedEligibility adapter = new ReviewedEligibility(address(this));
        require(!adapter.eligible(trader, address(stock)));
        adapter.setAssetPolicy(address(stock), true, keccak256("issuer policy"));
        require(!adapter.eligible(trader, address(stock)));
        adapter.attest(address(stock), trader, uint64(block.timestamp + 100), keccak256("verified eligibility"));
        require(adapter.eligible(trader, address(stock)));
        require(!adapter.eligible(creator, address(stock)));
        vm.warp(block.timestamp + 100);
        require(!adapter.eligible(trader, address(stock)));
    }

    function testEligibilityRevocationAndUnsupportedAsset() public {
        ReviewedEligibility adapter = new ReviewedEligibility(address(this));
        vm.expectRevert();
        adapter.attest(address(stock), trader, uint64(block.timestamp + 100), keccak256("evidence"));
        adapter.setAssetPolicy(address(stock), true, keccak256("issuer policy"));
        adapter.attest(address(stock), trader, uint64(block.timestamp + 100), keccak256("evidence"));
        adapter.revoke(address(stock), trader);
        require(!adapter.eligible(trader, address(stock)));
        adapter.attest(address(stock), trader, uint64(block.timestamp + 100), keccak256("evidence"));
        adapter.setAssetPolicy(address(stock), false, keccak256("revoked policy"));
        require(!adapter.eligible(trader, address(stock)));
    }

    function testUnauthorizedEligibilityChangesRevert() public {
        ReviewedEligibility adapter = new ReviewedEligibility(address(this));
        vm.prank(trader);
        vm.expectRevert();
        adapter.setAssetPolicy(address(stock), true, keccak256("policy"));
    }

    function testBootstrapGovernanceAndDelay() public {
        ThresholdMock safe = new ThresholdMock();
        RegistryBootstrap bootstrap = new RegistryBootstrap(address(safe));
        StockRegistry r = StockRegistry(bootstrap.registry());
        TimelockController timelock = TimelockController(payable(bootstrap.timelock()));
        require(timelock.getMinDelay() == 2 days);
        require(r.hasRole(r.DEFAULT_ADMIN_ROLE(), address(timelock)));
        require(r.hasRole(r.REVIEWER_ROLE(), address(timelock)));
        require(r.hasRole(r.PAUSER_ROLE(), address(safe)));
        require(!r.hasRole(r.REVIEWER_ROLE(), address(this)));
        require(!ReviewedEligibility(bootstrap.eligibility()).supportsAsset(address(stock)));
    }

    function testGovernedAssetApprovalBatch() public {
        ThresholdMock safe = new ThresholdMock();
        RegistryBootstrap bootstrap = new RegistryBootstrap(address(safe));
        TimelockController lock = TimelockController(payable(bootstrap.timelock()));
        StockRegistry target = StockRegistry(bootstrap.registry());
        ReviewedEligibility adapter = ReviewedEligibility(bootstrap.eligibility());
        address[] memory targets = new address[](2);
        uint256[] memory values = new uint256[](2);
        bytes[] memory payloads = new bytes[](2);
        bytes32 evidence = keccak256("owner approval and verified technical configuration");
        targets[0] = address(adapter);
        targets[1] = address(target);
        payloads[0] = abi.encodeCall(adapter.setAssetPolicy, (address(stock), true, evidence));
        payloads[1] = abi.encodeCall(
            target.review,
            (
                address(stock),
                StockRegistry.Asset(
                    address(stockOracle), address(adapter), 3600, 18, true, false, evidence, 50e18, 200e18
                )
            )
        );
        bytes32 salt = keccak256("approval batch");
        vm.prank(address(safe));
        lock.scheduleBatch(targets, values, payloads, bytes32(0), salt, 2 days);
        vm.expectRevert();
        lock.executeBatch(targets, values, payloads, bytes32(0), salt);
        vm.warp(block.timestamp + 2 days);
        // Future real feeds must publish a fresh valid price at execution too.
        stockOracle.set(100e8, block.timestamp, 1);
        lock.executeBatch(targets, values, payloads, bytes32(0), salt);
        (uint256 price,) = target.price(address(stock));
        require(price == 100e18);
        require(adapter.supportsAsset(address(stock)));
        require(!adapter.eligible(trader, address(stock)));
        require(lock.isOperationDone(lock.hashOperationBatch(targets, values, payloads, bytes32(0), salt)));
    }
}
