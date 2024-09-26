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
