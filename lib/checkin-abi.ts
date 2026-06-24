// AUTO-GENERATED ABI from contracts/artifacts/src/DropRankCheckin.sol/DropRankCheckin.json
// Regenerate after contract changes. Do not hand-edit the ABI below.
//
// Repeatable backend-attested check-in (no token) deployed on Base.

export const CHECKIN_BASE_CHAIN_ID = 8453 as const;
export const CHECKIN_BASE_SEPOLIA_CHAIN_ID = 84532 as const;

/** Active chain for signing + check-in. Must match BADGE_CHAIN_ID. */
export const CHECKIN_CHAIN_ID: number =
  Number(process.env.NEXT_PUBLIC_CHAIN_ID) || CHECKIN_BASE_CHAIN_ID;

/** EIP-712 domain (matches the contract constructor EIP712("DropRankCheckin", "1")). */
export const DROPRANK_CHECKIN_DOMAIN = { name: 'DropRankCheckin', version: '1' } as const;

/** EIP-712 types for the check-in attestation signed by the backend signer. */
export const CHECKIN_ATTESTATION_TYPES = {
  CheckinAttestation: [
    { name: 'wallet', type: 'address' },
    { name: 'score', type: 'uint16' },
    { name: 'nonce', type: 'uint64' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export const DROPRANK_CHECKIN_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "initialSigner",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [],
    "name": "AlreadyCheckedInToday",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ECDSAInvalidSignature",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "length",
        "type": "uint256"
      }
    ],
    "name": "ECDSAInvalidSignatureLength",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "s",
        "type": "bytes32"
      }
    ],
    "name": "ECDSAInvalidSignatureS",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidScore",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidShortString",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidSignature",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "OwnableInvalidOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "OwnableUnauthorizedAccount",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "RenounceDisabled",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "SignatureExpired",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "str",
        "type": "string"
      }
    ],
    "name": "StringTooLong",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ZeroSigner",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "wallet",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "score",
        "type": "uint16"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "streak",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "timestamp",
        "type": "uint64"
      }
    ],
    "name": "CheckedIn",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [],
    "name": "EIP712DomainChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousSigner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newSigner",
        "type": "address"
      }
    ],
    "name": "SignerUpdated",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "MAX_SCORE",
    "outputs": [
      {
        "internalType": "uint16",
        "name": "",
        "type": "uint16"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint16",
        "name": "score",
        "type": "uint16"
      },
      {
        "internalType": "uint256",
        "name": "deadline",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "sig",
        "type": "bytes"
      }
    ],
    "name": "checkIn",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "eip712Domain",
    "outputs": [
      {
        "internalType": "bytes1",
        "name": "fields",
        "type": "bytes1"
      },
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "version",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "chainId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "verifyingContract",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "salt",
        "type": "bytes32"
      },
      {
        "internalType": "uint256[]",
        "name": "extensions",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newSigner",
        "type": "address"
      }
    ],
    "name": "setSigner",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "signer",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "stateOf",
    "outputs": [
      {
        "internalType": "uint16",
        "name": "latestScore",
        "type": "uint16"
      },
      {
        "internalType": "uint32",
        "name": "count",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "currentStreak",
        "type": "uint32"
      },
      {
        "internalType": "uint64",
        "name": "lastCheckinAt",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "nonce",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
