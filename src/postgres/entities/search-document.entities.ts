import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

abstract class SearchDocumentBase {
  @Column({ type: "text", default: "" })
  name!: string;

  @Column({ name: "normalized_name", type: "text", default: "" })
  normalizedName!: string;

  @Column({ type: "text", nullable: true })
  slug!: string | null;

  @Column({ type: "text", array: true, default: "{}" })
  ecosystems!: string[];

  @Column({ type: "text", array: true, default: "{}" })
  chains!: string[];

  @Column({ type: "text", array: true, default: "{}" })
  investors!: string[];

  @Column({ type: "text", array: true, default: "{}" })
  tags!: string[];

  @Column({ name: "search_vector", type: "tsvector", select: false })
  searchVector!: string;

  @Column({ type: "jsonb" })
  payload!: Record<string, unknown>;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

@Entity({ name: "job_search_documents" })
@Index(["organizationId", "publishedAt"])
@Index(["projectId", "publishedAt"])
export class JobSearchDocumentEntity {
  @PrimaryColumn({ name: "job_node_id", type: "bigint" })
  jobNodeId!: string;

  @Column({ name: "structured_jobpost_id", type: "text", unique: true })
  structuredJobpostId!: string;

  @Column({ name: "short_uuid", type: "text", unique: true })
  shortUuid!: string;

  @Column({ name: "organization_id", type: "text", nullable: true })
  organizationId!: string | null;

  @Column({ name: "project_id", type: "text", nullable: true })
  projectId!: string | null;

  @Column({ name: "jobsite_id", type: "text", nullable: true })
  jobsiteId!: string | null;

  @Column({ type: "text", default: "" })
  title!: string;

  @Column({ type: "text", nullable: true })
  location!: string | null;

  @Column({ type: "text", nullable: true })
  access!: string | null;

  @Column({ name: "minimum_salary", type: "numeric", nullable: true })
  minimumSalary!: string | null;

  @Column({ name: "maximum_salary", type: "numeric", nullable: true })
  maximumSalary!: string | null;

  @Column({ name: "salary_currency", type: "text", nullable: true })
  salaryCurrency!: string | null;

  @Column({ type: "boolean", default: false })
  online!: boolean;

  @Column({ type: "boolean", default: false })
  blocked!: boolean;

  @Column({ type: "boolean", default: false })
  featured!: boolean;

  @Column({ name: "published_at", type: "timestamptz", nullable: true })
  publishedAt!: Date | null;

  @Column({ type: "text", array: true, default: "{}" })
  tags!: string[];

  @Column({ type: "text", array: true, default: "{}" })
  classifications!: string[];

  @Column({ type: "text", array: true, default: "{}" })
  commitments!: string[];

  @Column({ name: "location_types", type: "text", array: true, default: "{}" })
  locationTypes!: string[];

  @Column({ type: "text", array: true, default: "{}" })
  ecosystems!: string[];

  @Column({ name: "search_vector", type: "tsvector", select: false })
  searchVector!: string;

  @Column({ type: "jsonb" })
  payload!: Record<string, unknown>;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}

@Entity({ name: "organization_search_documents" })
@Index(["slug"], { unique: true, where: "slug IS NOT NULL" })
export class OrganizationSearchDocumentEntity extends SearchDocumentBase {
  @PrimaryColumn({ name: "organization_node_id", type: "bigint" })
  organizationNodeId!: string;

  @Column({ name: "organization_id", type: "text", unique: true })
  organizationId!: string;

  @Column({ type: "text", nullable: true })
  location!: string | null;

  @Column({ name: "headcount_estimate", type: "integer", nullable: true })
  headcountEstimate!: number | null;

  @Column({ name: "project_ids", type: "text", array: true, default: "{}" })
  projectIds!: string[];

  @Column({ name: "project_names", type: "text", array: true, default: "{}" })
  projectNames!: string[];

  @Column({ name: "funding_rounds", type: "text", array: true, default: "{}" })
  fundingRounds!: string[];
}

@Entity({ name: "project_search_documents" })
@Index(["slug"], { unique: true, where: "slug IS NOT NULL" })
export class ProjectSearchDocumentEntity extends SearchDocumentBase {
  @PrimaryColumn({ name: "project_node_id", type: "bigint" })
  projectNodeId!: string;

  @Column({ name: "project_id", type: "text", unique: true })
  projectId!: string;

  @Column({
    name: "organization_ids",
    type: "text",
    array: true,
    default: "{}",
  })
  organizationIds!: string[];

  @Column({ type: "text", array: true, default: "{}" })
  categories!: string[];

  @Column({ name: "has_hacks", type: "boolean", default: false })
  hasHacks!: boolean;

  @Column({ name: "has_audits", type: "boolean", default: false })
  hasAudits!: boolean;

  @Column({ type: "numeric", nullable: true })
  tvl!: string | null;

  @Column({ name: "monthly_volume", type: "numeric", nullable: true })
  monthlyVolume!: string | null;

  @Column({ name: "monthly_active_users", type: "numeric", nullable: true })
  monthlyActiveUsers!: string | null;

  @Column({ name: "monthly_fees", type: "numeric", nullable: true })
  monthlyFees!: string | null;

  @Column({ name: "monthly_revenue", type: "numeric", nullable: true })
  monthlyRevenue!: string | null;
}
