import { ApiProperty } from "@nestjs/swagger";
import { JobListResult } from "../job-list-result.interface";

export class RecommendedJob {
  @ApiProperty({ type: () => JobListResult })
  job: JobListResult;

  @ApiProperty()
  reason: string;
}

export class RecommendedJobsResponse {
  @ApiProperty()
  rankingVersion: string;

  @ApiProperty({ type: [RecommendedJob] })
  jobs: RecommendedJob[];

  @ApiProperty()
  total: number;

  @ApiProperty({ required: false })
  page?: number;

  @ApiProperty({ required: false })
  hasMore?: boolean;

  @ApiProperty({ required: false })
  rankedAt?: string;
}
