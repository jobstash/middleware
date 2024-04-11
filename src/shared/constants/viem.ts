export const ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const ECOSYSTEMS = {
  ETHDAM: "ethdam",
  ETHLONDON: "ethlondon",
  LOBSTERDAO: "lobsterdao",
  SUPERCHAIN: "superchain",
  DEV: "devcommunity",
  STAGING: "stagingcommunity",
} as const;

export const COMMUNITY_NFT_ADDRESSES = {
  [ECOSYSTEMS.ETHDAM]: {
    address: "0xb71df844faBa80EEcE907B421652E07FFFF505B4",
    label: "EthDam",
  },
  [ECOSYSTEMS.LOBSTERDAO]: {
    address: "0x026224a2940bfe258d0dbe947919b62fe321f042",
    label: "LobsterDAO",
  },
} as const;
