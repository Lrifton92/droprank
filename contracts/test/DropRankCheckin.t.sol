// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DropRankCheckin} from "../src/DropRankCheckin.sol";

contract DropRankCheckinTest is Test {
    DropRankCheckin checkin;

    uint256 signerKey = 0xA11CE;
    address signerAddr;

    address alice = address(0xA1);
    address bob = address(0xB0B);

    bytes32 constant TYPEHASH =
        keccak256("CheckinAttestation(address wallet,uint16 score,uint64 nonce,uint256 deadline)");

    function setUp() public {
        signerAddr = vm.addr(signerKey);
        checkin = new DropRankCheckin(signerAddr);
        // Land mid-day so day-boundary math is meaningful.
        vm.warp(1_000_000);
    }

    // --- helpers ---------------------------------------------------------

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("DropRankCheckin")),
                keccak256(bytes("1")),
                block.chainid,
                address(checkin)
            )
        );
    }

    function _sign(uint256 key, address wallet, uint16 score, uint64 nonce, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(abi.encode(TYPEHASH, wallet, score, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _checkIn(address who, uint16 score, uint64 nonce) internal {
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _sign(signerKey, who, score, nonce, deadline);
        vm.prank(who);
        checkin.checkIn(score, deadline, sig);
    }

    // --- core check-in ---------------------------------------------------

    function test_FirstCheckInRecordsState() public {
        _checkIn(alice, 72, 0);
        (uint16 latestScore, uint32 count, uint32 streak, uint64 lastAt, uint64 nonce) =
            checkin.stateOf(alice);
        assertEq(latestScore, 72);
        assertEq(count, 1);
        assertEq(streak, 1);
        assertEq(lastAt, uint64(block.timestamp));
        assertEq(nonce, 1);
    }

    function test_CheckInEmitsCheckedIn() public {
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _sign(signerKey, alice, 50, 0, deadline);

        vm.expectEmit(true, false, false, true);
        emit DropRankCheckin.CheckedIn(alice, 50, 1, uint64(block.timestamp));

        vm.prank(alice);
        checkin.checkIn(50, deadline, sig);
    }

    function test_CheckInAtMaxScore() public {
        _checkIn(alice, 100, 0);
        (uint16 latestScore,,,,) = checkin.stateOf(alice);
        assertEq(latestScore, 100);
    }

    // --- signature validation -------------------------------------------

    function test_RevertWhen_InvalidSigner() public {
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _sign(0xBAD, alice, 72, 0, deadline);
        vm.prank(alice);
        vm.expectRevert(DropRankCheckin.InvalidSignature.selector);
        checkin.checkIn(72, deadline, sig);
    }

    function test_RevertWhen_Expired() public {
        uint256 deadline = block.timestamp - 1;
        bytes memory sig = _sign(signerKey, alice, 72, 0, deadline);
        vm.prank(alice);
        vm.expectRevert(DropRankCheckin.SignatureExpired.selector);
        checkin.checkIn(72, deadline, sig);
    }

    function test_RevertWhen_ScoreAboveMax() public {
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _sign(signerKey, alice, 101, 0, deadline);
        vm.prank(alice);
        vm.expectRevert(DropRankCheckin.InvalidScore.selector);
        checkin.checkIn(101, deadline, sig);
    }

    function test_RevertWhen_SignatureBoundToOtherWallet() public {
        // Signature is bound to alice; bob cannot use it.
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _sign(signerKey, alice, 72, 0, deadline);
        vm.prank(bob);
        vm.expectRevert(DropRankCheckin.InvalidSignature.selector);
        checkin.checkIn(72, deadline, sig);
    }

    // --- replay / nonce --------------------------------------------------

    function test_RevertWhen_ReplayAcrossDays() public {
        // Long deadline so it survives the day warp and isolates nonce replay
        // (the deadline check runs before the signature check).
        uint256 deadline = block.timestamp + 3 days;
        bytes memory sig = _sign(signerKey, alice, 72, 0, deadline);
        vm.prank(alice);
        checkin.checkIn(72, deadline, sig);

        // Next day, reusing the old (nonce 0) signature must fail: nonce advanced to 1.
        vm.warp(block.timestamp + 1 days);
        vm.prank(alice);
        vm.expectRevert(DropRankCheckin.InvalidSignature.selector);
        checkin.checkIn(72, deadline, sig);
    }

    function test_NonceIncrementsPerCheckIn() public {
        _checkIn(alice, 60, 0);
        vm.warp(block.timestamp + 1 days);
        _checkIn(alice, 65, 1);
        (,,,, uint64 nonce) = checkin.stateOf(alice);
        assertEq(nonce, 2);
    }

    // --- daily limit + streak -------------------------------------------

    function test_RevertWhen_SecondCheckInSameDay() public {
        _checkIn(alice, 72, 0);
        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _sign(signerKey, alice, 73, 1, deadline);
        vm.prank(alice);
        vm.expectRevert(DropRankCheckin.AlreadyCheckedInToday.selector);
        checkin.checkIn(73, deadline, sig);
    }

    function test_StreakIncrementsOnConsecutiveDays() public {
        _checkIn(alice, 60, 0);
        vm.warp(block.timestamp + 1 days);
        _checkIn(alice, 62, 1);
        vm.warp(block.timestamp + 1 days);
        _checkIn(alice, 64, 2);
        (, uint32 count, uint32 streak,,) = checkin.stateOf(alice);
        assertEq(count, 3);
        assertEq(streak, 3);
    }

    function test_StreakResetsAfterGap() public {
        _checkIn(alice, 60, 0);
        // Skip two days (gap) -> streak resets to 1.
        vm.warp(block.timestamp + 2 days);
        _checkIn(alice, 70, 1);
        (, uint32 count, uint32 streak,,) = checkin.stateOf(alice);
        assertEq(count, 2);
        assertEq(streak, 1);
    }

    // --- signer rotation / ownership ------------------------------------

    function test_OwnerCanRotateSigner() public {
        uint256 newKey = 0xC0FFEE;
        address newSigner = vm.addr(newKey);
        checkin.setSigner(newSigner);
        assertEq(checkin.signer(), newSigner);

        uint256 deadline = block.timestamp + 10 minutes;
        bytes memory sig = _sign(newKey, alice, 55, 0, deadline);
        vm.prank(alice);
        checkin.checkIn(55, deadline, sig);
        (uint16 latestScore,,,,) = checkin.stateOf(alice);
        assertEq(latestScore, 55);
    }

    function test_RevertWhen_NonOwnerRotatesSigner() public {
        vm.prank(alice);
        vm.expectRevert();
        checkin.setSigner(bob);
    }

    function test_RevertWhen_SetSignerZero() public {
        vm.expectRevert(DropRankCheckin.ZeroSigner.selector);
        checkin.setSigner(address(0));
    }

    function test_RevertWhen_RenounceOwnership() public {
        vm.expectRevert(DropRankCheckin.RenounceDisabled.selector);
        checkin.renounceOwnership();
        assertEq(checkin.owner(), address(this));
    }

    function test_RevertWhen_ConstructorZeroSigner() public {
        vm.expectRevert(DropRankCheckin.ZeroSigner.selector);
        new DropRankCheckin(address(0));
    }
}
