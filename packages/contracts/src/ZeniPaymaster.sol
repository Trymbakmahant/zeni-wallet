// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24 <0.9.0;

import "./IAccount.sol";
import "./UserOperation.sol";

/**
 * @title ZeniPaymaster
 * @notice ERC-4337 Sponsoring Paymaster subsidizing onboarding gas fees on QoreChain
 */
contract ZeniPaymaster {
    address public immutable entryPoint;
    address public owner;
    address public verifyingSigner;

    uint256 public maxSponsorshipPerOp = 0.05 ether;
    mapping(address => uint256) public sponsoredOpsCount;

    event GasSponsored(address indexed account, uint256 actualGasCost);
    event SignerUpdated(address indexed newSigner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Paymaster: caller not owner");
        _;
    }

    modifier onlyEntryPoint() {
        require(msg.sender == entryPoint, "Paymaster: caller not EntryPoint");
        _;
    }

    constructor(address _entryPoint, address _verifyingSigner) payable {
        require(_entryPoint != address(0), "Paymaster: invalid EntryPoint");
        entryPoint = _entryPoint;
        owner = msg.sender;
        verifyingSigner = _verifyingSigner;
    }

    function setVerifyingSigner(address _newSigner) external onlyOwner {
        require(_newSigner != address(0), "Paymaster: invalid signer");
        verifyingSigner = _newSigner;
        emit SignerUpdated(_newSigner);
    }

    function deposit() external payable {
        IEntryPoint(entryPoint).depositTo{value: msg.value}(address(this));
    }

    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external onlyEntryPoint returns (bytes memory context, uint256 validationData) {
        require(maxCost <= maxSponsorshipPerOp, "Paymaster: gas exceeds max sponsorship");
        require(userOp.paymasterAndData.length >= 20, "Paymaster: invalid paymaster data length");

        sponsoredOpsCount[userOp.sender] += 1;
        context = abi.encode(userOp.sender);
        validationData = 0; // Success
    }

    function postOp(
        uint8,
        bytes calldata context,
        uint256 actualGasCost
    ) external onlyEntryPoint {
        address sender = abi.decode(context, (address));
        emit GasSponsored(sender, actualGasCost);
    }

    function withdraw(address payable recipient, uint256 amount) external onlyOwner {
        require(recipient != address(0), "Paymaster: invalid recipient");
        (bool sent, ) = recipient.call{value: amount}("");
        require(sent, "Paymaster: transfer failed");
    }

    receive() external payable {}
}
