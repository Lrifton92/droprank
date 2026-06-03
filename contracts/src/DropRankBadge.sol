// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title DropRankBadge
/// @notice Soulbound ERC-721 badge proving a DropRank airdrop-readiness score.
///         Non transferable, one token per address, burnable by its holder.
///         The score is attested off-chain (EIP-712) by a backend signer and
///         carried fully on-chain (SVG data-URI tokenURI). Score is refreshable.
contract DropRankBadge is ERC721, Ownable, EIP712 {
    using Strings for uint256;

    error Soulbound();
    error AlreadyMinted();
    error NotMinted();
    error SignatureExpired();
    error InvalidSignature();
    error ZeroSigner();
    error InvalidScore();
    error NotOwner();
    error RenounceDisabled();

    /// @dev keccak256("ScoreAttestation(address wallet,uint16 score,uint256 deadline)")
    bytes32 private constant SCORE_ATTESTATION_TYPEHASH =
        keccak256("ScoreAttestation(address wallet,uint16 score,uint256 deadline)");

    uint16 public constant MAX_SCORE = 100;

    /// @notice Backend address authorized to sign score attestations.
    address public signer;

    /// @notice Token id minted by an address (0 means none — token ids start at 1).
    mapping(address => uint256) public tokenOf;

    /// @notice Current score stored for a token id.
    mapping(uint256 => uint16) public scoreOf;

    uint256 private _nextId = 1;

    event Minted(address indexed wallet, uint256 indexed tokenId, uint16 score);
    event Refreshed(address indexed wallet, uint256 indexed tokenId, uint16 score);
    event SignerUpdated(address indexed previousSigner, address indexed newSigner);

    constructor(address initialSigner)
        ERC721("DropRank", "DROP")
        Ownable(msg.sender)
        EIP712("DropRank", "1")
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

    /// @notice Mint the caller's soulbound badge with a signed score.
    function mint(uint16 score, uint256 deadline, bytes calldata sig) external {
        if (tokenOf[msg.sender] != 0) revert AlreadyMinted();
        _verify(msg.sender, score, deadline, sig);

        uint256 tokenId = _nextId++;
        tokenOf[msg.sender] = tokenId;
        scoreOf[tokenId] = score;
        _safeMint(msg.sender, tokenId);

        emit Minted(msg.sender, tokenId, score);
    }

    /// @notice Update the caller's badge score with a fresh signed attestation.
    function refresh(uint16 score, uint256 deadline, bytes calldata sig) external {
        uint256 tokenId = tokenOf[msg.sender];
        if (tokenId == 0) revert NotMinted();
        _verify(msg.sender, score, deadline, sig);

        scoreOf[tokenId] = score;
        emit Refreshed(msg.sender, tokenId, score);
    }

    /// @notice Burn the caller's own badge.
    function burn(uint256 tokenId) external {
        // Defensive: only the badge's own token id may be burned by its holder.
        if (tokenOf[msg.sender] != tokenId) revert NotOwner();
        // _update with to == address(0) is permitted by soulbound logic.
        // ownership is enforced by passing msg.sender as auth.
        _update(address(0), tokenId, msg.sender);
        delete tokenOf[msg.sender];
        delete scoreOf[tokenId];
    }

    function _verify(address wallet, uint16 score, uint256 deadline, bytes calldata sig) private view {
        if (score > MAX_SCORE) revert InvalidScore();
        if (block.timestamp > deadline) revert SignatureExpired();

        bytes32 structHash = keccak256(abi.encode(SCORE_ATTESTATION_TYPEHASH, wallet, score, deadline));
        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = ECDSA.recover(digest, sig);
        if (recovered != signer) revert InvalidSignature();
    }

    // --- Soulbound enforcement ---------------------------------------------

    /// @dev Allow only mint (from == 0) and burn (to == 0). Block transfers.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    // --- Metadata ----------------------------------------------------------

    // SECURITY: never concat user-controlled strings here (only uint->string + internal const tier)
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        uint16 score = scoreOf[tokenId];
        string memory tier = _tier(score);
        string memory scoreStr = uint256(score).toString();

        string memory svg = _svg(scoreStr, tier);

        string memory json = string.concat(
            '{"name":"DropRank Badge #',
            tokenId.toString(),
            '","description":"Soulbound DropRank airdrop-readiness badge on Base.",',
            '"attributes":[{"trait_type":"Score","value":',
            scoreStr,
            '},{"trait_type":"Tier","value":"',
            tier,
            '"}],"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '"}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _tier(uint16 score) private pure returns (string memory) {
        if (score >= 80) return "BASED";
        if (score >= 60) return "GOLD";
        if (score >= 40) return "SILVER";
        return "BRONZE";
    }

    function _svg(string memory scoreStr, string memory tier) private pure returns (string memory) {
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
            '<rect width="400" height="400" fill="#0a0e17"/>',
            '<rect x="150" y="60" width="100" height="100" rx="12" fill="#0052FF"/>',
            '<text x="200" y="210" font-family="monospace" font-size="28" font-weight="bold" fill="#ffffff" text-anchor="middle">DROPRANK</text>',
            '<text x="200" y="290" font-family="monospace" font-size="64" font-weight="bold" fill="#0052FF" text-anchor="middle">',
            scoreStr,
            '</text>',
            '<text x="200" y="330" font-family="monospace" font-size="20" fill="#8a93a6" text-anchor="middle">/ 100</text>',
            '<text x="200" y="370" font-family="monospace" font-size="24" font-weight="bold" fill="#ffffff" text-anchor="middle">',
            tier,
            '</text>',
            '</svg>'
        );
    }
}
