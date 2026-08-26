import { ApiProperty } from "@nestjs/swagger";
import { JobListResult } from "../job-list-result.interface";

export class RecommendedJob {
  @ApiProperty({ type: () => JobListResult })
  job: JobListResult;

  @ApiProperty()
  reason: string;
}

export class RecommendedJobsResponse {
  @ApiProperty({ type: [RecommendedJob] })
  jobs: RecommendedJob[];

  @ApiProperty()
  total: number;
}
