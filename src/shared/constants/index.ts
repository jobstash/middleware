import { SessionObject } from "../interfaces";

export * from "./check-wallet-result";
export * from "./cache-control";
export * from "./headers";
export * from "./testing";
export * from "./cache-keys";

export const NON_PUBLIC_API_ROUTES = [
  "/organizations",
  "/organizations/all",
  "/organizations/featured",
  "/organizations/{id}",
  "/organizations/upload-logo",
  "/organizations/create",
  "/organizations/update/{id}",
  "/organizations/delete/{id}",
  "/organizations/add-alias",
  "/organizations/add-project",
  "/organizations/remove-project",
  "/organizations/transform-to-project/{id}",
  "/organizations/communities",
  "/organizations/jobsites/activate",
  "/organizations/repositories/{id}",
  "/projects",
  "/projects/search",
  "/projects/all/{id}",
  "/projects/{id}",
  "/projects/prefiller",
  "/projects/upload-logo",
  "/projects/create",
  "/projects/update/{id}",
  "/projects/delete/{id}",
  "/projects/metrics/update/{id}",
  "/projects/metrics/delete/{id}",
  "/projects/link-jobs",
  "/projects/unlink-jobs",
  "/projects/link-repos",
  "/projects/unlink-repos",
];

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
