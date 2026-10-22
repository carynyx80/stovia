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
}
