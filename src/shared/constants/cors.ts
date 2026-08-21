export const BROWSER_CORS_METHODS = [
  "GET",
  "HEAD",
  "OPTIONS",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
] as const;

export const BROWSER_CORS_HEADERS = [
  "authorization",
  "content-type",
  "x-app-version",
  "x-ecosystem",
  "x-request-id",
  "x-white-label-board-domain",
  "x-white-label-board-route",
] as const;
