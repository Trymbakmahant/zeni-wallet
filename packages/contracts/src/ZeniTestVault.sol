// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24 <0.9.0;

/// @notice Testnet-only demonstration of wallet-approved contract transactions.
/// No admin, yield, token approvals, or access to anyone else's deposit.
contract ZeniTestVault {
    mapping(address => uint256) public deposits;
    bool private withdrawing;
    error InvalidAmount();
    error InsufficientDeposit();
    error TransferFailed();
    error Reentrancy();
    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);

    function deposit() external payable {
        if (msg.value == 0) revert InvalidAmount();
        deposits[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        if (withdrawing) revert Reentrancy();
        if (amount == 0) revert InvalidAmount();
        if (amount > deposits[msg.sender]) revert InsufficientDeposit();
        withdrawing = true;
        deposits[msg.sender] -= amount;
        (bool sent,) = payable(msg.sender).call{value: amount}("");
        if (!sent) revert TransferFailed();
        withdrawing = false;
        emit Withdrawn(msg.sender, amount);
    }
}
