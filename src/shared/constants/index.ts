import { SessionObject } from "../interfaces";

export * from "./check-wallet-result";
export * from "./cache-control";
export * from "./headers";
export * from "./testing";
export * from "./stripe";
export * from "./cache-keys";
export * from "./search";

export const EMPTY_SESSION_OBJECT: SessionObject = {
  address: null,
  cryptoNative: false,
  permissions: [],
};

export const ADMIN_SESSION_OBJECT: SessionObject = {
  address: "0xbB0d2D6eccC20aD778A0Fe7762ac20100c6D131f",
  cryptoNative: true,
  permissions: [
    "SUPER_ADMIN",
    "ADMIN",
    "PROJECT_MANAGER",
    "ORG_MANAGER",
    "TAGS_MANAGER",
  ],
};
