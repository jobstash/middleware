import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { JobListParams } from "./job-list.input";

export class JobFeedParams extends JobListParams {
  @ApiPropertyOptional({
    description: "Pillar slug whose criteria constrain the feed",
  })
  @IsOptional()
  @IsString()
  pillar?: string;
}

export function shouldGroupJobs(params: Partial<JobListParams>): boolean {
  const hasValues = (values?: string[] | null): boolean =>
    Boolean(values?.some(value => value.trim()));
  return !(
    hasValues(params.tags) ||
    hasValues(params.organizations) ||
    hasValues(params.projects) ||
    hasValues(params.cities) ||
    params.organizationId?.trim() ||
    params.expertJobs === true ||
    params.query?.trim() ||
    params.titleQuery?.trim() ||
    (params.orderBy && params.orderBy !== "publicationDate") ||
    params.order === "asc"
  );
}
