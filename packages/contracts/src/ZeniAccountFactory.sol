// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24 <0.9.0;

import "./ZeniSmartAccount.sol";

/**
 * @title ZeniAccountFactory
 * @notice Factory contract to compute deterministic counterfactual addresses and deploy ZeniSmartAccount via CREATE2
 */
contract ZeniAccountFactory {
    address public immutable entryPoint;

    event AccountCreated(address indexed account, address indexed owner, bytes32 indexed pqcPubKeyHash);

    constructor(address _entryPoint) {
        require(_entryPoint != address(0), "Factory: invalid EntryPoint");
        entryPoint = _entryPoint;
    }

    /**
     * @notice Computes counterfactual address for a smart account
     */
    function getAddress(
        address owner,
        bytes32 pqcPubKeyHash,
        uint256 salt
    ) public view returns (address) {
        bytes memory bytecode = getCreationBytecode(owner, pqcPubKeyHash);
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                bytes32(salt),
                keccak256(bytecode)
            )
        );
        return address(uint160(uint256(hash)));
    }

    /**
     * @notice Deploys and initializes account if not already deployed
     */
    function createAccount(
        address owner,
        bytes32 pqcPubKeyHash,
        uint256 salt
    ) external returns (ZeniSmartAccount) {
        address expectedAddress = getAddress(owner, pqcPubKeyHash, salt);
        if (expectedAddress.code.length > 0) {
            return ZeniSmartAccount(payable(expectedAddress));
        }

        bytes memory bytecode = getCreationBytecode(owner, pqcPubKeyHash);
        address deployed;
        bytes32 saltBytes = bytes32(salt);

        assembly {
            deployed := create2(0, add(bytecode, 0x20), mload(bytecode), saltBytes)
            if iszero(deployed) {
                revert(0, 0)
            }
        }

        ZeniSmartAccount account = ZeniSmartAccount(payable(deployed));
        account.initialize(owner, pqcPubKeyHash);

        emit AccountCreated(deployed, owner, pqcPubKeyHash);
        return account;
    }

    /**
     * @dev Bytecode used for CREATE2 calculation
     */
    function getCreationBytecode(
        address,
        bytes32
    ) internal view returns (bytes memory) {
        return abi.encodePacked(
            type(ZeniSmartAccount).creationCode,
            abi.encode(entryPoint)
        );
    }
}
