import { ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";

export class Jobpost {
  public static readonly JobpostType = t.strict({
    id: t.string,
    title: t.string,
    source: t.string,
    location: t.string,
    shortUUID: t.string,
    jobsiteId: t.string,
    commitment: t.string,
    jobpageUrl: t.string,
    description: t.string,
    applypageUrl: t.string,
    foundTimestamp: t.number,
    createdTimestamp: t.number,
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  source: string;

  @ApiProperty()
  location: string;

  @ApiProperty()
  shortUUID: string;

  @ApiProperty()
  jobsiteId: string;

  @ApiProperty()
  commitment: string;

  @ApiProperty()
  jobpageUrl: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  applypageUrl: string;

  @ApiProperty()
  foundTimestamp: number;

  @ApiProperty()
  createdTimestamp: number;

  constructor(raw: Jobpost) {
    const {
      id,
      title,
      source,
      location,
      shortUUID,
      jobsiteId,
      commitment,
      jobpageUrl,
      description,
      applypageUrl,
      foundTimestamp,
      createdTimestamp,
    } = raw;

    const result = Jobpost.JobpostType.decode(raw);

    this.id = id;
    this.title = title;
    this.source = source;
    this.location = location;
    this.shortUUID = shortUUID;
    this.jobsiteId = jobsiteId;
    this.commitment = commitment;
    this.jobpageUrl = jobpageUrl;
    this.description = description;
    this.applypageUrl = applypageUrl;
    this.foundTimestamp = foundTimestamp;
    this.createdTimestamp = createdTimestamp;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `jobpost instance with id ${this.shortUUID} failed validation with error '${x}'`,
        );
      });
    }
  }
}
