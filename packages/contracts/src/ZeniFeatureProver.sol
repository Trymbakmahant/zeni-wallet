// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24 <0.9.0;

import {IQorePQC} from "./IQorePQC.sol";

/**
 * @notice Diana PQC precompile demonstration. Holds no funds and grants no authority.
 * @dev Successful verification is NOT a login session, transaction authorization,
 * spending policy, or Cross-VM operation. No promise of automatic hackathon badges.
 * Anyone can relay a signature; a receipt does not prove the sender owns the PQC key.
 */
contract ZeniFeatureProver {
    address public constant PQC_VERIFY_PRECOMPILE = address(0x0000000000000000000000000000000000000a01);
    address public constant PQC_KEY_STATUS_PRECOMPILE = address(0x0000000000000000000000000000000000000a02);

    error InvalidAccount();
    error InvalidRegisteredKey();
    error InvalidSignature();
    error InvalidMessageLength();

    event PqcKeyStatusVerified(address indexed account, bytes32 publicKeyHash);
    event PqcSignatureVerified(address indexed account, bytes32 publicKeyHash, bytes32 messageHash);

    function registeredKey(address account) internal view returns (bytes memory pubkey) {
        if (account == address(0)) revert InvalidAccount();
        (bool registered, uint8 algorithmId, bytes memory key) =
            IQorePQC(PQC_KEY_STATUS_PRECOMPILE).pqcKeyStatus(account);
        if (!registered || algorithmId != 1 || key.length != 2592) revert InvalidRegisteredKey();
        return key;
    }

    function verifyKeyStatus(address account) external returns (bytes32 publicKeyHash) {
        publicKeyHash = keccak256(registeredKey(account));
        emit PqcKeyStatusVerified(account, publicKeyHash);
    }

    // The caller cannot substitute an unrelated public key. Reverts on failed verification.
    function verifyRegisteredSignature(address account, bytes calldata signature, bytes calldata message)
        external returns (bytes32 publicKeyHash)
    {
        if (signature.length != 4627) revert InvalidSignature();
        if (message.length == 0 || message.length > 4096) revert InvalidMessageLength();
        bytes memory pubkey = registeredKey(account);
        if (!IQorePQC(PQC_VERIFY_PRECOMPILE).pqcVerify(pubkey, signature, message)) revert InvalidSignature();
        publicKeyHash = keccak256(pubkey);
        emit PqcSignatureVerified(account, publicKeyHash, keccak256(message));
    }
}
