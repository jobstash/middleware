export const CACHE_CONTROL_HEADER = (duration: number): string =>
  `max-age=${duration}, public`;

export const CACHE_EXPIRY = (durationSeconds: number): string => {
  const nowMillis = Date.now();
  const intervalMillis = durationSeconds * 1000;

  // Find which time window we're currently in
  const currentWindow = Math.floor(nowMillis / intervalMillis);

  // Calculate the end of the current window
  const expiryMillis = (currentWindow + 1) * intervalMillis;

  return new Date(expiryMillis).toUTCString();
};

export const CACHE_DURATION = 3600;

export const NO_CACHE = "no-cache, private, no-store, must-revalidate";

export const IN_MEM_CACHE_EXPIRY = 1800000000; //in milliseconds
