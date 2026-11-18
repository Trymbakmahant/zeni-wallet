// SPDX-License-Identifier: MIT
pragma solidity >=0.8.24 <0.9.0;
import {IQorePQC} from "../src/IQorePQC.sol";
import {ZeniFeatureProver} from "../src/ZeniFeatureProver.sol";
import {ZeniSmartAccount} from "../src/ZeniSmartAccount.sol";
interface Vm {
    function mockCall(address, bytes calldata, bytes calldata) external;
    function expectRevert(bytes4) external;
    function expectRevert() external;
}
contract SignatureHarness is ZeniSmartAccount {
    constructor() ZeniSmartAccount(address(1)) {}
    function verify(bytes32 digest, bytes memory sig, bytes memory key) external view returns (bool) {
        return verifyPqcSignature(digest, sig, key);
    }
}
contract PqcVerificationTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    ZeniFeatureProver prover;
    SignatureHarness harness;
    address constant ACCOUNT = address(0x1234);
    address constant STATUS = address(0x0a02);
    address constant VERIFY = address(0x0a01);
    function setUp() public { prover = new ZeniFeatureProver(); harness = new SignatureHarness(); }
    function status(bool registered, uint8 algorithm, bytes memory key) internal {
        vm.mockCall(STATUS, abi.encodeCall(IQorePQC.pqcKeyStatus, (ACCOUNT)), abi.encode(registered, algorithm, key));
    }
    function testRegisteredKey() public {
        bytes memory key = new bytes(2592); status(true, 1, key);
        require(prover.verifyKeyStatus(ACCOUNT) == keccak256(key));
    }
    function testUnregisteredRejected() public {
        status(false, 0, ""); vm.expectRevert(ZeniFeatureProver.InvalidRegisteredKey.selector); prover.verifyKeyStatus(ACCOUNT);
    }
    function testWrongAlgorithmRejected() public {
        status(true, 2, new bytes(2592)); vm.expectRevert(ZeniFeatureProver.InvalidRegisteredKey.selector); prover.verifyKeyStatus(ACCOUNT);
    }
    function testMalformedKeyRejected() public {
        status(true, 1, hex"42"); vm.expectRevert(ZeniFeatureProver.InvalidRegisteredKey.selector); prover.verifyKeyStatus(ACCOUNT);
    }
    function testZeroAccountRejected() public {
        vm.expectRevert(ZeniFeatureProver.InvalidAccount.selector); prover.verifyKeyStatus(address(0));
    }
    function testUsesRegisteredKeyAndOfficialSelector() public {
        bytes memory key = new bytes(2592); key[0] = 0x42;
        bytes memory sig = new bytes(4627); bytes memory message = hex"1234";
        status(true, 1, key);
        vm.mockCall(VERIFY, abi.encodeCall(IQorePQC.pqcVerify, (key, sig, message)), abi.encode(true));
        require(prover.verifyRegisteredSignature(ACCOUNT, sig, message) == keccak256(key));
    }
    function testInvalidSignatureCannotEmitSuccess() public {
        status(true, 1, new bytes(2592));
        vm.mockCall(VERIFY, abi.encodeWithSelector(IQorePQC.pqcVerify.selector), abi.encode(false));
        vm.expectRevert(ZeniFeatureProver.InvalidSignature.selector);
        prover.verifyRegisteredSignature(ACCOUNT, new bytes(4627), hex"1234");
    }
    function testMalformedSignatureRejected() public {
        vm.expectRevert(ZeniFeatureProver.InvalidSignature.selector);
        prover.verifyRegisteredSignature(ACCOUNT, hex"42", hex"1234");
    }
    function testEmptyMessageRejected() public {
        vm.expectRevert(ZeniFeatureProver.InvalidMessageLength.selector);
        prover.verifyRegisteredSignature(ACCOUNT, new bytes(4627), "");
    }
    function testOversizeMessageRejected() public {
        vm.expectRevert(ZeniFeatureProver.InvalidMessageLength.selector);
        prover.verifyRegisteredSignature(ACCOUNT, new bytes(4627), new bytes(4097));
    }
    function testUnavailableStatusFailsClosed() public {
        vm.expectRevert(); prover.verifyKeyStatus(ACCOUNT);
    }
    function testSmartAccountUsesOfficialABI() public {
        bytes32 digest = keccak256("sample");
        bytes memory key = new bytes(2592); bytes memory sig = new bytes(4627);
        vm.mockCall(VERIFY, abi.encodeCall(IQorePQC.pqcVerify, (key, sig, abi.encodePacked(digest))), abi.encode(true));
        require(harness.verify(digest, sig, key));
    }
    function testSmartAccountRejectsMalformedResponse() public {
        vm.mockCall(VERIFY, abi.encodeWithSelector(IQorePQC.pqcVerify.selector), abi.encode(uint256(2)));
        require(!harness.verify(bytes32(0), new bytes(4627), new bytes(2592)));
    }
    function testSmartAccountRejectsMissingPrecompile() public {
        require(!harness.verify(bytes32(0), new bytes(4627), new bytes(2592)));
    }
    function testSmartAccountRejectsBadKeyAndSignatureLengths() public {
        vm.mockCall(VERIFY, abi.encodeWithSelector(IQorePQC.pqcVerify.selector), abi.encode(true));
        require(!harness.verify(bytes32(0), new bytes(4626), new bytes(2592)));
        require(!harness.verify(bytes32(0), new bytes(4627), new bytes(2591)));
    }
}
