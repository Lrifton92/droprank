// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title DropRankCheckin
/// @notice Repeatable, backend-attested "stamp my DropRank score onchain" action.
///         Each check-in is authorized off-chain (EIP-712) by a backend signer,
///         appends to a verifiable event history, and maintains a daily streak.
///         No token; complements the soulbound DropRankBadge.
contract DropRankCheckin is Ownable, EIP712 {
    error InvalidScore();
    error SignatureExpired();
    error InvalidSignature();
    error ZeroSigner();
    error AlreadyCheckedInToday();
    error RenounceDisabled();

    /// @dev keccak256("CheckinAttestation(address wallet,uint16 score,uint64 nonce,uint256 deadline)")
    bytes32 private constant CHECKIN_TYPEHASH =
        keccak256("CheckinAttestation(address wallet,uint16 score,uint64 nonce,uint256 deadline)");

    uint16 public constant MAX_SCORE = 100;

    /// @notice Backend address authorized to sign check-in attestations.
    address public signer;

    /// @notice Packed per-wallet check-in state (fits in a single storage slot:
    ///         16 + 32 + 32 + 64 + 64 = 208 bits).
    struct CheckinState {
        uint16 latestScore;   // 0..100
        uint32 count;         // total check-ins
        uint32 currentStreak; // consecutive UTC-day streak
        uint64 lastCheckinAt; // unix ts of last check-in
        uint64 nonce;         // next expected signature nonce
    }

    /// @notice Read API: latest score, count, streak, last check-in ts, next nonce.
    mapping(address => CheckinState) public stateOf;

    /// @notice Append-only history lives in this event.
    event CheckedIn(address indexed wallet, uint16 score, uint32 streak, uint64 timestamp);
    event SignerUpdated(address indexed previousSigner, address indexed newSigner);

    constructor(address initialSigner)
        Ownable(msg.sender)
        EIP712("DropRankCheckin", "1")
    {
        if (initialSigner == address(0)) revert ZeroSigner();
        signer = initialSigner;
        emit SignerUpdated(address(0), initialSigner);
    }

    /// @notice Renouncing ownership is disabled: it would permanently lock out
    ///         setSigner, making signer rotation impossible after a key leak.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    /// @notice Rotate the backend signer (e.g. key compromise / rotation).
    function setSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroSigner();
        address previous = signer;
        signer = newSigner;
        emit SignerUpdated(previous, newSigner);
    }

    /// @notice Stamp the caller's backend-signed DropRank score onchain.
    /// @dev Once per UTC day. The nonce is read from state (not a call arg) so
    ///      stale-score signatures cannot be replayed on a later day.
    function checkIn(uint16 score, uint256 deadline, bytes calldata sig) external {
        if (score > MAX_SCORE) revert InvalidScore();
        if (block.timestamp > deadline) revert SignatureExpired();

        CheckinState memory st = stateOf[msg.sender];

        bytes32 structHash =
            keccak256(abi.encode(CHECKIN_TYPEHASH, msg.sender, score, st.nonce, deadline));
        bytes32 digest = _hashTypedDataV4(structHash);
        if (ECDSA.recover(digest, sig) != signer) revert InvalidSignature();

        uint32 streak;
        if (st.count == 0) {
            streak = 1;
        } else {
            uint256 today = block.timestamp / 1 days;
            uint256 lastDay = uint256(st.lastCheckinAt) / 1 days;
            if (today == lastDay) {
                revert AlreadyCheckedInToday();
            } else if (today == lastDay + 1) {
                streak = st.currentStreak + 1;
            } else {
                streak = 1;
            }
        }

        stateOf[msg.sender] = CheckinState({
            latestScore: score,
            count: st.count + 1,
            currentStreak: streak,
            lastCheckinAt: uint64(block.timestamp),
            nonce: st.nonce + 1
        });

        emit CheckedIn(msg.sender, score, streak, uint64(block.timestamp));
    }
}
