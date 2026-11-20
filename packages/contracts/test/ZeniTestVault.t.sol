// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24 <0.9.0;
import {ZeniTestVault} from "../src/ZeniTestVault.sol";
interface VaultVm {
    function deal(address, uint256) external;
    function prank(address) external;
    function expectRevert(bytes4) external;
}
contract RejectingDepositor {
    function deposit(ZeniTestVault vault) external payable { vault.deposit{value: msg.value}(); }
    function withdraw(ZeniTestVault vault) external { vault.withdraw(1 ether); }
}
contract ReenteringDepositor {
    ZeniTestVault public vault;
    bool public reentered;
    constructor(ZeniTestVault v) { vault = v; }
    function run() external payable { vault.deposit{value: msg.value}(); vault.withdraw(1 ether); }
    receive() external payable { (reentered,) = address(vault).call(abi.encodeCall(vault.withdraw, (1 ether))); }
}
contract ZeniTestVaultTest {
    VaultVm constant vm = VaultVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    ZeniTestVault vault;
    address constant ALICE = address(0xa11ce);
    address constant BOB = address(0xb0b);
    function setUp() public { vault = new ZeniTestVault(); vm.deal(ALICE, 10 ether); vm.deal(address(this), 10 ether); }
    function testDepositAndWithdraw() public {
        vm.prank(ALICE); vault.deposit{value: 2 ether}();
        require(vault.deposits(ALICE) == 2 ether);
        vm.prank(ALICE); vault.withdraw(1 ether);
        require(vault.deposits(ALICE) == 1 ether && ALICE.balance == 9 ether);
    }
    function testCannotWithdrawAnotherAccountsDeposit() public {
        vm.prank(ALICE); vault.deposit{value: 2 ether}();
        vm.expectRevert(ZeniTestVault.InsufficientDeposit.selector); vm.prank(BOB); vault.withdraw(1 ether);
    }
    function testZeroDepositAndOverdrawRejected() public {
        vm.expectRevert(ZeniTestVault.InvalidAmount.selector); vault.deposit();
        vm.expectRevert(ZeniTestVault.InvalidAmount.selector); vault.withdraw(0);
        vm.expectRevert(ZeniTestVault.InsufficientDeposit.selector); vm.prank(ALICE); vault.withdraw(1 ether);
    }
    function testRejectedWithdrawalPreservesBalance() public {
        RejectingDepositor recipient = new RejectingDepositor();
        recipient.deposit{value: 1 ether}(vault);
        vm.expectRevert(ZeniTestVault.TransferFailed.selector); recipient.withdraw(vault);
        require(vault.deposits(address(recipient)) == 1 ether);
    }
    function testReentryCannotWithdrawTwice() public {
        ReenteringDepositor attacker = new ReenteringDepositor(vault);
        attacker.run{value: 2 ether}();
        require(!attacker.reentered() && vault.deposits(address(attacker)) == 1 ether);
    }
}
