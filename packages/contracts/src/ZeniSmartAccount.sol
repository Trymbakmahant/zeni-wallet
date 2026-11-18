// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24 <0.9.0;

import "./IAccount.sol";
import {IQorePQC} from "./IQorePQC.sol";
import "./UserOperation.sol";

/**
 * @title ZeniSmartAccount
 * @notice Post-quantum protected smart contract wallet for QoreChain (ERC-4337 v0.7 + ERC-1271)
 * @dev Enforces dual-authorization: classical secp256k1 ECDSA + ML-DSA-87 (Dilithium-5) via native precompile
 */
contract ZeniSmartAccount is IAccount {
    address public constant PQC_PRECOMPILE = address(0x0000000000000000000000000000000000000a01);
    bytes4 internal constant ERC1271_MAGICVALUE = 0x1626ba7e;
    bytes4 internal constant ERC1271_INVALID = 0xffffffff;
    uint256 internal constant SIG_VALIDATION_FAILED = 1;

    address public immutable entryPoint;
    bytes32 public immutable DOMAIN_SEPARATOR;

    address public owner;
    bytes32 public registeredPqcPubKeyHash;
    bool private initialized;

    event AccountInitialized(address indexed owner, bytes32 indexed pqcPubKeyHash);
    event Executed(address indexed target, uint256 value, bytes data);
    event BatchExecuted(uint256 count);

    modifier onlyEntryPoint() {
        require(msg.sender == entryPoint, "Zeni: caller must be EntryPoint");
        _;
    }

    constructor(address _entryPoint) {
        require(_entryPoint != address(0), "Zeni: invalid EntryPoint");
        entryPoint = _entryPoint;
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("ZeniSmartAccount")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
        // Lock implementation initialization
        initialized = true;
    }

    /**
     * @notice Initializes proxy account state atomically
     * @param _owner Classical key owner address
     * @param _pqcPubKeyHash Keccak256 hash of the registered ML-DSA-87 public key
     */
    function initialize(address _owner, bytes32 _pqcPubKeyHash) external {
        require(!initialized, "Zeni: already initialized");
        require(_owner != address(0), "Zeni: invalid owner address");
        require(_pqcPubKeyHash != bytes32(0), "Zeni: invalid PQC key hash");

        owner = _owner;
        registeredPqcPubKeyHash = _pqcPubKeyHash;
        initialized = true;

        emit AccountInitialized(_owner, _pqcPubKeyHash);
    }

    /**
     * @notice Execute a single call via EntryPoint
     */
    function execute(address dest, uint256 value, bytes calldata func) external onlyEntryPoint {
        require(dest != address(0), "Zeni: invalid destination");
        (bool success, bytes memory result) = dest.call{value: value}(func);
        if (!success) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
        emit Executed(dest, value, func);
    }

    /**
     * @notice Execute a batch of calls via EntryPoint
     */
    function executeBatch(
        address[] calldata dest,
        uint256[] calldata value,
        bytes[] calldata func
    ) external onlyEntryPoint {
        require(
            dest.length == value.length && dest.length == func.length,
            "Zeni: array lengths mismatch"
        );

        for (uint256 i = 0; i < dest.length; i++) {
            (bool success, bytes memory result) = dest[i].call{value: value[i]}(func[i]);
            if (!success) {
                assembly {
                    revert(add(result, 32), mload(result))
                }
            }
        }
        emit BatchExecuted(dest.length);
    }

    /**
     * @notice Validates ERC-4337 UserOperation with hybrid signatures
     */
    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external override onlyEntryPoint returns (uint256 validationData) {
        if (userOp.signature.length < 65) {
            return SIG_VALIDATION_FAILED;
        }

        // Decode composite ABI signature: (classicalSig, pqcSig, pqcPubKey)
        (bytes memory sigClassical, bytes memory sigPqc, bytes memory pqcPubKey) =
            abi.decode(userOp.signature, (bytes, bytes, bytes));

        // 1. Enforce registered PQC key binding
        if (keccak256(pqcPubKey) != registeredPqcPubKeyHash) {
            return SIG_VALIDATION_FAILED;
        }

        // 2. Validate classical ECDSA signature against owner
        bytes32 ethSignedHash = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", userOpHash)
        );
        address recovered = recoverSigner(ethSignedHash, sigClassical);
        if (recovered != owner) {
            return SIG_VALIDATION_FAILED;
        }

        // 3. Validate post-quantum ML-DSA-87 signature via precompile
        if (!verifyPqcSignature(userOpHash, sigPqc, pqcPubKey)) {
            return SIG_VALIDATION_FAILED;
        }

        // 4. Reimburse EntryPoint for required missing gas funds
        if (missingAccountFunds > 0) {
            (bool paid, ) = payable(entryPoint).call{value: missingAccountFunds}("");
            require(paid, "Zeni: failed to pre-fund EntryPoint");
        }

        return 0; // Success: validUntil = 0, validAfter = 0, authorizer = 0
    }

    /**
     * @notice ERC-1271 Signature verification with domain separator binding
     */
    function isValidSignature(
        bytes32 _hash,
        bytes memory _signature
    ) public view returns (bytes4) {
        if (_signature.length < 65) {
            return ERC1271_INVALID;
        }

        (bytes memory sigClassical, bytes memory sigPqc, bytes memory pqcPubKey) =
            abi.decode(_signature, (bytes, bytes, bytes));

        // Enforce PQC key binding
        if (keccak256(pqcPubKey) != registeredPqcPubKeyHash) {
            return ERC1271_INVALID;
        }

        // Protect against cross-chain and cross-contract replays
        bytes32 boundHash = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, _hash)
        );

        address recovered = recoverSigner(boundHash, sigClassical);
        if (recovered != owner) {
            return ERC1271_INVALID;
        }

        if (!verifyPqcSignature(boundHash, sigPqc, pqcPubKey)) {
            return ERC1271_INVALID;
        }

        return ERC1271_MAGICVALUE;
    }

    /**
     * @dev Invokes QoreChain's native pqcVerify precompile
     */
    function verifyPqcSignature(
        bytes32 digest,
        bytes memory signature,
        bytes memory publicKey
    ) internal view returns (bool) {
        if (publicKey.length != 2592 || signature.length != 4627) return false;
        (bool ok, bytes memory res) = PQC_PRECOMPILE.staticcall(
            abi.encodeCall(IQorePQC.pqcVerify, (publicKey, signature, abi.encodePacked(digest)))
        );
        if (!ok || res.length != 32) {
            return false;
        }
        // A malformed/non-canonical boolean must fail closed, not revert decoding.
        return abi.decode(res, (uint256)) == 1;
    }

    /**
     * @dev Recovers classical ECDSA address from a 65-byte signature
     */
    function recoverSigner(
        bytes32 messageHash,
        bytes memory sig
    ) internal pure returns (address) {
        if (sig.length != 65) {
            return address(0);
        }

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }

        if (v < 27) {
            v += 27;
        }

        if (v != 27 && v != 28) {
            return address(0);
        }

        return ecrecover(messageHash, v, r, s);
    }

    receive() external payable {}
}
