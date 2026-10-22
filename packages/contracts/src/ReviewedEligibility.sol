// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @notice Enforces recorded external eligibility attestations. Governance cannot replace issuer/legal review with a hash alone.
contract ReviewedEligibility is AccessControl {
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");

    struct Attestation {
        uint64 validUntil;
        bytes32 evidenceHash;
    }
    mapping(address => bool) public supportsAsset;
    mapping(address => mapping(address => Attestation)) public attestations;
    event AssetPolicy(address indexed asset, bool supported, bytes32 evidenceHash);
    event EligibilityRecorded(address indexed asset, address indexed account, uint64 validUntil, bytes32 evidenceHash);

    constructor(address governance) {
        require(governance.code.length > 0, "governance contract");
        _grantRole(DEFAULT_ADMIN_ROLE, governance);
        _grantRole(COMPLIANCE_ROLE, governance);
    }

    function setAssetPolicy(address asset, bool supported, bytes32 evidenceHash) external onlyRole(COMPLIANCE_ROLE) {
        require(asset.code.length > 0 && evidenceHash != 0, "review evidence");
        supportsAsset[asset] = supported;
        emit AssetPolicy(asset, supported, evidenceHash);
    }

    function attest(address asset, address account, uint64 validUntil, bytes32 evidenceHash)
        external
        onlyRole(COMPLIANCE_ROLE)
    {
        require(supportsAsset[asset] && account != address(0), "unsupported account or asset");
        require(validUntil > block.timestamp && evidenceHash != 0, "attestation evidence");
        attestations[asset][account] = Attestation(validUntil, evidenceHash);
        emit EligibilityRecorded(asset, account, validUntil, evidenceHash);
    }

    function revoke(address asset, address account) external onlyRole(COMPLIANCE_ROLE) {
        delete attestations[asset][account];
        emit EligibilityRecorded(asset, account, 0, 0);
    }

    function eligible(address account, address asset) external view returns (bool) {
        Attestation memory a = attestations[asset][account];
        return supportsAsset[asset] && a.evidenceHash != 0 && a.validUntil > block.timestamp;
    }
}
