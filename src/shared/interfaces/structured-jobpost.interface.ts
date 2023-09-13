import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";

export class StructuredJobpost {
  public static readonly StructuredJobpostType = t.strict({
    id: t.string,
    shortUUID: t.string,
    jobApplyPageUrl: t.string,
    jobFoundTimestamp: t.number,
    extractedTimestamp: t.number,
    jobCreatedTimestamp: t.number,
    role: t.union([t.string, t.null]),
    team: t.union([t.string, t.null]),
    culture: t.union([t.string, t.null]),
    benefits: t.union([t.string, t.null]),
    jobTitle: t.union([t.string, t.null]),
    seniority: t.union([t.string, t.null]),
    jobPageUrl: t.union([t.string, t.null]),
    jobLocation: t.union([t.string, t.null]),
    medianSalary: t.union([t.number, t.null]),
    paysInCrypto: t.union([t.boolean, t.null]),
    jobCommitment: t.union([t.string, t.null]),
    minSalaryRange: t.union([t.number, t.null]),
    maxSalaryRange: t.union([t.number, t.null]),
    salaryCurrency: t.union([t.string, t.null]),
    offersTokenAllocation: t.union([t.boolean, t.null]),
    aiDetectedTechnologies: t.union([t.string, t.null]),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  shortUUID: string;

  @ApiProperty()
  minSalaryRange: number | null;

  @ApiProperty()
  maxSalaryRange: number | null;

  @ApiProperty()
  medianSalary: number | null;

  @ApiProperty()
  role: string | null;

  @ApiProperty()
  seniority: string | null;

  @ApiProperty()
  team: string | null;

  @ApiProperty()
  benefits: string | null;

  @ApiProperty()
  culture: string | null;

  @ApiProperty()
  salaryCurrency: string | null;

  @ApiProperty()
  paysInCrypto: boolean | null;

  @ApiProperty()
  offersTokenAllocation: boolean | null;

  @ApiProperty()
  jobApplyPageUrl: string;

  @ApiPropertyOptional()
  jobCommitment: string | null;

  @ApiProperty()
  jobCreatedTimestamp: number;

  @ApiProperty()
  jobFoundTimestamp: number;

  @ApiProperty()
  jobPageUrl: string | null;

  @ApiProperty()
  jobLocation: string | null;

  @ApiProperty()
  jobTitle: string | null;

  @ApiProperty()
  aiDetectedTechnologies: string | null;

  @ApiProperty()
  extractedTimestamp: number;

  constructor(raw: StructuredJobpost) {
    const {
      id,
      role,
      team,
      culture,
      benefits,
      jobTitle,
      shortUUID,
      seniority,
      jobPageUrl,
      jobLocation,
      medianSalary,
      paysInCrypto,
      jobCommitment,
      minSalaryRange,
      maxSalaryRange,
      salaryCurrency,
      jobApplyPageUrl,
      jobFoundTimestamp,
      extractedTimestamp,
      jobCreatedTimestamp,
      offersTokenAllocation,
      aiDetectedTechnologies,
    } = raw;

    const result = StructuredJobpost.StructuredJobpostType.decode(raw);

    this.id = id;
    this.role = role;
    this.team = team;
    this.culture = culture;
    this.benefits = benefits;
    this.jobTitle = jobTitle;
    this.shortUUID = shortUUID;
    this.seniority = seniority;
    this.jobPageUrl = jobPageUrl;
    this.jobLocation = jobLocation;
    this.medianSalary = medianSalary;
    this.paysInCrypto = paysInCrypto;
    this.jobCommitment = jobCommitment;
    this.minSalaryRange = minSalaryRange;
    this.maxSalaryRange = maxSalaryRange;
    this.salaryCurrency = salaryCurrency;
    this.jobApplyPageUrl = jobApplyPageUrl;
    this.jobFoundTimestamp = jobFoundTimestamp;
    this.extractedTimestamp = extractedTimestamp;
    this.jobCreatedTimestamp = jobCreatedTimestamp;
    this.offersTokenAllocation = offersTokenAllocation;
    this.aiDetectedTechnologies = aiDetectedTechnologies;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `structured jobpost instance with id ${this.shortUUID} failed validation with error '${x}'`,
        );
      });
    }
  }
}
