export interface CanonicalJobClassification {
  code: string;
  label: string;
  filterKey: string;
  pillarSlug: string;
}

const classification = (
  code: string,
  label: string,
  filterKey: string,
): CanonicalJobClassification => ({
  code,
  label,
  filterKey,
  pillarSlug: `cl-${filterKey}`,
});

/** Must remain byte-for-byte aligned with the authoritative ETL enum/catalog. */
export const CANONICAL_JOB_CLASSIFICATIONS = Object.freeze([
  classification("ACCOUNTING", "Accounting", "accounting"),
  classification("AI", "AI", "ai"),
  classification("AUDITING", "Auditing", "auditing"),
  classification("BACKEND", "Backend", "backend"),
  classification("BIZDEV", "Business Development", "bizdev"),
  classification("COMMUNITY", "Community", "community"),
  classification("CUSTOMER_SUPPORT", "Customer Support", "customer-support"),
  classification("CYBERSECURITY", "Cybersecurity", "cybersecurity"),
  classification("DATA_SCIENCE", "Data Science", "data-science"),
  classification("DESIGN", "Design", "design"),
  classification("DEVOPS", "DevOps", "devops"),
  classification("DEVREL", "Developer Relations", "devrel"),
  classification("ENGINEERING", "Engineering", "engineering"),
  classification(
    "ENGINEERING_MANAGEMENT",
    "Engineering Management",
    "engineering-management",
  ),
  classification("EVENTS", "Events", "events"),
  classification("FINANCE", "Finance", "finance"),
  classification(
    "FORWARD_DEPLOYED_ENGINEER",
    "Forward Deployed Engineer",
    "forward-deployed-engineer",
  ),
  classification("FRONTEND", "Frontend", "frontend"),
  classification("FULLSTACK", "Fullstack", "fullstack"),
  classification("GROWTH", "Growth", "growth"),
  classification("HUMAN_RESOURCES", "Human Resources", "human-resources"),
  classification("LEGAL", "Legal", "legal"),
  classification("MANAGEMENT", "Management", "management"),
  classification("MARKETING", "Marketing", "marketing"),
  classification("OPERATIONS", "Operations", "operations"),
  classification("OTHER", "Other", "other"),
  classification("PARTNERSHIPS", "Partnerships", "partnerships"),
  classification("PEOPLE", "People", "people"),
  classification("PRODUCT", "Product", "product"),
  classification(
    "PRODUCT_MANAGEMENT",
    "Product Management",
    "product-management",
  ),
  classification(
    "PROJECT_MANAGEMENT",
    "Project Management",
    "project-management",
  ),
  classification("RESEARCH", "Research", "research"),
  classification("SALES", "Sales", "sales"),
  classification("SMART_CONTRACTS", "Smart Contracts", "smart-contracts"),
  classification("TECHNICAL_WRITING", "Technical Writing", "technical-writing"),
  classification("TRADING", "Trading", "trading"),
]) as readonly CanonicalJobClassification[];

export const CANONICAL_JOB_CLASSIFICATION_CODES = Object.freeze(
  CANONICAL_JOB_CLASSIFICATIONS.map(item => item.code),
);
