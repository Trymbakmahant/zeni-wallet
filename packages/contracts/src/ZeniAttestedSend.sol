// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ZeniAttestedSend
/// @notice Cross-VM attested payment on QoreChain Diana testnet.
/// @dev `pay` forwards native QOR to `to` and, inside the SAME EVM transaction,
///      calls the governance-allowlisted `qday-receipts` CosmWasm contract through
///      the cross-VM bridge precompile at 0x0901. If the native write reverts,
///      the whole transaction — payment included — reverts.
contract ZeniAttestedSend {
    /// @dev The cross-VM bridge precompile (QoreChain Native lane, targetVM = 1).
    address public constant CROSSVM = 0x0000000000000000000000000000000000000901;

    /// @dev Allowlisted CosmWasm receipt contract (code id 865, bridge pin verified).
    string public constant RECEIPTS =
        "qor1xjayq5ev55tkzpml9klxwyshr7gdrha0nurha9jhm0f0gdckksgs3gltw8";

    event AttestedPayment(address indexed to, uint256 value, string note, bytes receipt);

    /// @notice Pay `to` and record a native receipt for it in the same transaction.
    /// @param note Plain-text note recorded on the native lane. Must not contain `"` or `\`.
    /// @return receipt Raw bytes returned by the native contract (its JSON response).
    function pay(address payable to, string calldata note) external payable returns (bytes memory receipt) {
        require(to != address(0), "no recipient");

        // Native lane first: {"record":{"note":"<note>"}} on the allowlisted contract.
        (bool ok, bytes memory ret) = CROSSVM.call(
            abi.encodeWithSignature(
                "executeCrossVMCall(uint8,string,bytes)",
                uint8(1),
                RECEIPTS,
                abi.encodePacked('{"record":{"note":"', note, '"}}')
            )
        );
        if (!ok) {
            // Propagate the bridge's revert reason, e.g. Error("not allowlisted").
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }

        // Payment last (checks-effects-interactions); a revert above already
        // guarantees it only lands together with the native receipt.
        (bool sent, ) = to.call{value: msg.value}("");
        require(sent, "payment failed");

        emit AttestedPayment(to, msg.value, note, ret);
        return ret;
    }
}
