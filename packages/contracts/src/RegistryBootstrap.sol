// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {StockRegistry} from "./Stovia.sol";
import {ReviewedEligibility} from "./ReviewedEligibility.sol";

interface IThresholdSafe {
    function getThreshold() external view returns (uint256);
}

/// @notice Deploys governance plumbing only. It approves no assets and holds no funds.
contract RegistryBootstrap {
    address public immutable timelock;
    address public immutable registry;
    address public immutable eligibility;
    event RegistryInfrastructure(address indexed governance, address timelock, address registry, address eligibility);

    constructor(address governance) {
        require(governance.code.length > 0 && IThresholdSafe(governance).getThreshold() > 1, "multisig");
        address[] memory proposers = new address[](1);
        proposers[0] = governance;
        address[] memory executors = new address[](1);
        executors[0] = address(0);
        timelock = address(new TimelockController(2 days, proposers, executors, address(0)));
        registry = address(new StockRegistry(timelock, governance));
        eligibility = address(new ReviewedEligibility(timelock));
        emit RegistryInfrastructure(governance, timelock, registry, eligibility);
    }
}
