// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24 <0.9.0;

import "./UserOperation.sol";

interface IAccount {
    /**
     * @notice Validates a user operation according to ERC-4337
     * @param userOp The operation to validate
     * @param userOpHash Hash of the user operation
     * @param missingAccountFunds Gas pre-fund amount required by EntryPoint
     * @return validationData Packed validation data (authorizer, validUntil, validAfter)
     */
    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData);
}

interface IEntryPoint {
    function depositTo(address account) external payable;
    function getNonce(address sender, uint192 key) external view returns (uint256 nonce);
    function getUserOpHash(UserOperation calldata userOp) external view returns (bytes32);
}
