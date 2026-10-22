// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import "../src/Stovia.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

interface DeploymentVM {
    function envBool(string calldata) external returns (bool);
    function envAddress(string calldata) external returns (address);
    function envUint(string calldata) external returns (uint256);
    function startBroadcast() external;
    function stopBroadcast() external;
}

interface IMultisig {
    function getThreshold() external view returns (uint256);
}

contract Deploy {
    DeploymentVM constant vm = DeploymentVM(address(uint160(uint256(keccak256("hevm cheat code")))));
    event Deployment(address registry, address vault, address factory, address router, address timelock);

    function run() external {
        require(block.chainid == 4663, "mainnet chain mismatch");
        require(vm.envBool("AUTHORIZED_MAINNET_DEPLOYMENT"), "Explicit human deployment authorization required");
        require(vm.envBool("AUDIT_AND_ISSUER_REVIEW_COMPLETE"), "readiness gate");
        address multisig = vm.envAddress("GOVERNANCE_MULTISIG");
        require(multisig.code.length > 0 && IMultisig(multisig).getThreshold() > 1, "multisig");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address oracle = vm.envAddress("ETH_USD_ORACLE_ADDRESS");
        uint256 maxAge = vm.envUint("ETH_ORACLE_MAX_AGE");
        address[] memory proposers = new address[](1);
        proposers[0] = multisig;
        address[] memory executors = new address[](1);
        executors[0] = address(0);
        vm.startBroadcast();
        TimelockController timelock = new TimelockController(2 days, proposers, executors, address(0));
        StockRegistry registry = new StockRegistry(address(timelock), multisig);
        // tx.origin is the broadcaster only in this deployment script, never protocol authorization.
        FeeVault vault = new FeeVault(tx.origin, treasury);
        LaunchFactory factory = new LaunchFactory(registry, vault, treasury, oracle, maxAge, address(timelock));
        vault.grantRole(vault.REGISTRAR_ROLE(), address(factory));
        vault.grantRole(vault.DEFAULT_ADMIN_ROLE(), address(timelock));
        vault.renounceRole(vault.DEFAULT_ADMIN_ROLE(), tx.origin);
        PaymentRouter router = new PaymentRouter(factory, registry, address(timelock));
        emit Deployment(address(registry), address(vault), address(factory), address(router), address(timelock));
        vm.stopBroadcast();
    }
}
