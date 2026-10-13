// Canonical employer verticals shared with organization classification writes.
export const ORGANIZATION_VERTICALS = [
  "crypto",
  "fintech",
  "ai",
  "robotics",
  "banking",
  "tech",
  "out_of_scope",
  "unclassified",
] as const;

export type OrganizationVertical = (typeof ORGANIZATION_VERTICALS)[number];

const ORGANIZATION_CLASSIFICATION_LABELS: Record<OrganizationVertical, string> =
  {
    crypto: "Crypto",
    fintech: "Fintech",
    ai: "AI",
    robotics: "Robotics",
    banking: "Banking",
    // Public display name; the canonical stored value remains tech.
    tech: "Web2",
    out_of_scope: "Out of scope",
    unclassified: "Unclassified",
  };

export const ORGANIZATION_CLASSIFICATION_OPTIONS = ORGANIZATION_VERTICALS.map(
  value => ({ label: ORGANIZATION_CLASSIFICATION_LABELS[value], value }),
);
