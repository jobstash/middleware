import { ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { JobListResult } from "./job-list-result.interface";

export class JobpostFolder {
  public static readonly JobpostFolderType = t.strict({
    id: t.string,
    name: t.string,
    isPublic: t.boolean,
    jobs: t.array(JobListResult.JobListResultType),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  isPublic: boolean;

  @ApiProperty()
  jobs: JobListResult[];

  constructor(raw: JobpostFolder) {
    const { id, name, isPublic, jobs } = raw;

    const result = JobpostFolder.JobpostFolderType.decode(raw);

    this.id = id;
    this.name = name;
    this.isPublic = isPublic;
    this.jobs = jobs;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(x);
      });
    }
  }
}
