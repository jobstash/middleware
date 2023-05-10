export const CACHE_CONTROL_HEADER = (duration: number): string =>
  `max-age=${duration}, public`;
export const CACHE_EXPIRY = (duration: number): string => {
  return new Date(new Date().getTime() + 1000 * duration).toUTCString();
};

export const CACHE_DURATION = 300;

export const NO_CACHE = "no-cache, private, no-store, must-revalidate";
