// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DropRankBadge} from "../src/DropRankBadge.sol";

contract DropRankBadgeTest is Test {
    DropRankBadge badge;

    uint256 signerKey = 0xA11CE;
    address signerAddr;

    address alice = address(0xA1);
    address bob = address(0xB0B);

    bytes32 constant TYPEHASH =
        keccak256("ScoreAttestation(address wallet,uint16 score,uint256 deadline)");

    function setUp() public {
        signerAddr = vm.addr(signerKey);
        badge = new DropRankBadge(signerAddr);
        // Ensure deadline checks are meaningful.
        vm.warp(1_000_000);
    }

    // --- helpers ---------------------------------------------------------

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes("DropRank")),
                keccak256(bytes("1")),
                block.chainid,
                address(badge)
            )
        );
    }

    function _sign(uint256 key, address wallet, uint16 score, uint256 deadline)
        internal
        view
        returns (bytes memory)
    {
        bytes32 structHash = keccak256(abi.encode(TYPEHASH, wallet, score, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    // --- mint ------------------------------------------------------------

    function test_MintWithValidSignature() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(signerKey, alice, 72, deadline);

        vm.prank(alice);
        badge.mint(72, deadline, sig);

        assertEq(badge.ownerOf(1), alice);
        assertEq(badge.balanceOf(alice), 1);
        assertEq(badge.tokenOf(alice), 1);
        assertEq(badge.scoreOf(1), 72);
    }

    function test_MintEmitsMinted() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(signerKey, alice, 50, deadline);

        vm.expectEmit(true, true, false, true);
        emit DropRankBadge.Minted(alice, 1, 50);

        vm.prank(alice);
        badge.mint(50, deadline, sig);
    }

    function test_RevertWhen_InvalidSigner() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(0xBAD, alice, 72, deadline); // wrong key

        vm.prank(alice);
        vm.expectRevert(DropRankBadge.InvalidSignature.selector);
        badge.mint(72, deadline, sig);
    }

    function test_RevertWhen_Expired() public {
        uint256 deadline = block.timestamp - 1; // already past
        bytes memory sig = _sign(signerKey, alice, 72, deadline);

        vm.prank(alice);
        vm.expectRevert(DropRankBadge.SignatureExpired.selector);
        badge.mint(72, deadline, sig);
    }

    function test_RevertWhen_ReplayOnOtherWallet() public {
        // Signature is bound to alice; bob cannot replay it.
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(signerKey, alice, 72, deadline);

        vm.prank(bob);
        vm.expectRevert(DropRankBadge.InvalidSignature.selector);
        badge.mint(72, deadline, sig);
    }

    function test_RevertWhen_MintTwice() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(signerKey, alice, 72, deadline);

        vm.prank(alice);
        badge.mint(72, deadline, sig);

        bytes memory sig2 = _sign(signerKey, alice, 73, deadline);
        vm.prank(alice);
        vm.expectRevert(DropRankBadge.AlreadyMinted.selector);
        badge.mint(73, deadline, sig2);
    }

    function test_RevertWhen_ScoreAboveMax() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(signerKey, alice, 101, deadline);

        vm.prank(alice);
        vm.expectRevert(DropRankBadge.InvalidScore.selector);
        badge.mint(101, deadline, sig);
    }

    // --- refresh ---------------------------------------------------------

    function test_RefreshUpdatesScore() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(signerKey, alice, 40, deadline);
        vm.prank(alice);
        badge.mint(40, deadline, sig);

        uint256 d2 = block.timestamp + 2 hours;
        bytes memory sig2 = _sign(signerKey, alice, 85, d2);
        vm.expectEmit(true, true, false, true);
        emit DropRankBadge.Refreshed(alice, 1, 85);
        vm.prank(alice);
        badge.refresh(85, d2, sig2);

        assertEq(badge.scoreOf(1), 85);
        assertEq(badge.tokenOf(alice), 1); // same token id
    }

    function test_RevertWhen_RefreshWithoutMint() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(signerKey, alice, 40, deadline);
        vm.prank(alice);
        vm.expectRevert(DropRankBadge.NotMinted.selector);
        badge.refresh(40, deadline, sig);
    }

    // --- soulbound -------------------------------------------------------

    function test_RevertWhen_Transfer() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(signerKey, alice, 60, deadline);
        vm.prank(alice);
        badge.mint(60, deadline, sig);

        vm.prank(alice);
        vm.expectRevert(DropRankBadge.Soulbound.selector);
        badge.transferFrom(alice, bob, 1);
    }

    function test_RevertWhen_Approve() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(signerKey, alice, 60, deadline);
        vm.prank(alice);
        badge.mint(60, deadline, sig);

        vm.prank(alice);
        vm.expectRevert(DropRankBadge.Soulbound.selector);
        badge.approve(bob, 1);
    }

    function test_RevertWhen_SetApprovalForAll() public {
        vm.prank(alice);
        vm.expectRevert(DropRankBadge.Soulbound.selector);
        badge.setApprovalForAll(bob, true);
    }

    // --- burn ------------------------------------------------------------

    function test_HolderCanBurn() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(signerKey, alice, 60, deadline);
        vm.prank(alice);
        badge.mint(60, deadline, sig);

        vm.prank(alice);
        badge.burn(1);

        assertEq(badge.balanceOf(alice), 0);
        assertEq(badge.tokenOf(alice), 0);
    }

    function test_RevertWhen_BurnNotOwner() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(signerKey, alice, 60, deadline);
        vm.prank(alice);
        badge.mint(60, deadline, sig);

        vm.prank(bob);
        vm.expectRevert(); // ERC721 not authorized
        badge.burn(1);
    }

    function test_CanMintAgainAfterBurn() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(signerKey, alice, 60, deadline);
        vm.prank(alice);
        badge.mint(60, deadline, sig);
        vm.prank(alice);
        badge.burn(1);

        // new attestation, new mint => new token id (2)
        bytes memory sig2 = _sign(signerKey, alice, 90, deadline);
        vm.prank(alice);
        badge.mint(90, deadline, sig2);
        assertEq(badge.tokenOf(alice), 2);
        assertEq(badge.scoreOf(2), 90);
    }

    // --- signer rotation -------------------------------------------------

    function test_OwnerCanRotateSigner() public {
        uint256 newKey = 0xC0FFEE;
        address newSigner = vm.addr(newKey);
        badge.setSigner(newSigner);
        assertEq(badge.signer(), newSigner);

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(newKey, alice, 55, deadline);
        vm.prank(alice);
        badge.mint(55, deadline, sig);
        assertEq(badge.scoreOf(1), 55);
    }

    function test_RevertWhen_NonOwnerRotatesSigner() public {
        vm.prank(alice);
        vm.expectRevert();
        badge.setSigner(bob);
    }

    // --- tokenURI / tiers ------------------------------------------------

    function test_TokenURIContainsTier() public {
        uint256 deadline = block.timestamp + 1 hours;

        bytes memory sig = _sign(signerKey, alice, 90, deadline);
        vm.prank(alice);
        badge.mint(90, deadline, sig);

        string memory uri = badge.tokenURI(1);
        // decode and assert tier BASED present
        assertTrue(_contains(_decodeJson(uri), "BASED"), "BASED tier");
        assertTrue(_contains(_decodeJson(uri), '"value":90'), "score 90");
    }

    function test_TierBoundaries() public {
        _assertTier(alice, 39, "BRONZE");
        _assertTier(bob, 40, "SILVER");
        _assertTier(address(0xC1), 60, "GOLD");
        _assertTier(address(0xD1), 80, "BASED");
    }

    function _assertTier(address who, uint16 score, string memory expected) internal {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(signerKey, who, score, deadline);
        vm.prank(who);
        badge.mint(score, deadline, sig);
        uint256 id = badge.tokenOf(who);
        assertTrue(_contains(_decodeJson(badge.tokenURI(id)), expected), expected);
    }

    // base64-decode of the JSON portion is heavy in Solidity; instead we
    // re-render the SVG path off the raw URI by checking the encoded prefix
    // and trusting tier text is inside the (base64) blob via a marker scan.
    // For simplicity we decode using a small helper.
    function _decodeJson(string memory uri) internal pure returns (string memory) {
        // strip "data:application/json;base64," prefix (29 chars)
        bytes memory b = bytes(uri);
        bytes memory payload = new bytes(b.length - 29);
        for (uint256 i = 29; i < b.length; i++) {
            payload[i - 29] = b[i];
        }
        return string(_base64decode(string(payload)));
    }

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length == 0 || n.length > h.length) return false;
        for (uint256 i = 0; i <= h.length - n.length; i++) {
            bool ok = true;
            for (uint256 j = 0; j < n.length; j++) {
                if (h[i + j] != n[j]) {
                    ok = false;
                    break;
                }
            }
            if (ok) return true;
        }
        return false;
    }

    // minimal base64 decoder for test assertions
    function _base64decode(string memory data) internal pure returns (bytes memory) {
        bytes memory b = bytes(data);
        if (b.length == 0) return new bytes(0);

        uint256 padding = 0;
        if (b[b.length - 1] == "=") padding++;
        if (b[b.length - 2] == "=") padding++;

        uint256 outLen = (b.length / 4) * 3 - padding;
        bytes memory result = new bytes(outLen);

        uint256 o = 0;
        for (uint256 i = 0; i < b.length; i += 4) {
            uint256 a0 = _b64idx(b[i]);
            uint256 a1 = _b64idx(b[i + 1]);
            uint256 a2 = b[i + 2] == "=" ? 0 : _b64idx(b[i + 2]);
            uint256 a3 = b[i + 3] == "=" ? 0 : _b64idx(b[i + 3]);
            uint256 chunk = (a0 << 18) | (a1 << 12) | (a2 << 6) | a3;
            if (o < outLen) result[o++] = bytes1(uint8(chunk >> 16));
            if (o < outLen) result[o++] = bytes1(uint8(chunk >> 8));
            if (o < outLen) result[o++] = bytes1(uint8(chunk));
        }
        return result;
    }

    function _b64idx(bytes1 c) internal pure returns (uint256) {
        uint8 v = uint8(c);
        if (v >= 65 && v <= 90) return v - 65; // A-Z
        if (v >= 97 && v <= 122) return v - 71; // a-z
        if (v >= 48 && v <= 57) return v + 4; // 0-9
        if (v == 43) return 62; // +
        if (v == 47) return 63; // /
        return 0;
    }
}
