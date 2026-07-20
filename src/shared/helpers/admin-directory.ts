const ADMIN_DIRECTORY_DEFAULT_LIMIT = 25;
const ADMIN_DIRECTORY_MAX_LIMIT = 100;
const ADMIN_DIRECTORY_MAX_QUERY_LENGTH = 200;

const parseInteger = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
};

export const parseAdminDirectoryPagination = (
  rawLimit?: string,
  rawOffset?: string,
): { limit: number; offset: number } => ({
  limit: Math.max(
    1,
    Math.min(
      parseInteger(rawLimit, ADMIN_DIRECTORY_DEFAULT_LIMIT),
      ADMIN_DIRECTORY_MAX_LIMIT,
    ),
  ),
  offset: Math.max(0, parseInteger(rawOffset, 0)),
});

export const normalizeAdminDirectoryQuery = (
  rawQuery?: string,
): string | undefined =>
  rawQuery?.trim().slice(0, ADMIN_DIRECTORY_MAX_QUERY_LENGTH) || undefined;
