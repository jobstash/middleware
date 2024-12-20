import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class OrgJob {
  public static readonly OrgJobType = t.strict({
    id: t.string,
    shortUUID: t.string,
    classification: t.string,
    title: t.union([t.string, t.null]),
    salary: t.union([t.number, t.null]),
    location: t.union([t.string, t.null]),
    summary: t.union([t.string, t.null]),
    seniority: t.union([t.string, t.null]),
    paysInCrypto: t.union([t.boolean, t.null]),
    featured: t.union([t.boolean, t.null]),
    featureStartDate: t.union([t.number, t.null]),
    featureEndDate: t.union([t.number, t.null]),
    minimumSalary: t.union([t.number, t.null]),
    maximumSalary: t.union([t.number, t.null]),
    salaryCurrency: t.union([t.string, t.null]),
    offersTokenAllocation: t.union([t.boolean, t.null]),
    commitment: t.union([t.string, t.null]),
    timestamp: t.union([t.number, t.null]),
    locationType: t.union([t.string, t.null]),
    tags: t.array(t.string),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  shortUUID: string;

  @ApiProperty()
  classification: string;

  @ApiPropertyOptional()
  title: string | null;

  @ApiPropertyOptional()
  salary: number | null;

  @ApiPropertyOptional()
  location: string | null;

  @ApiPropertyOptional()
  summary: string | null;

  @ApiPropertyOptional()
  seniority: string | null;

  @ApiPropertyOptional()
  paysInCrypto: boolean | null;

  @ApiPropertyOptional()
  minimumSalary: number | null;

  @ApiPropertyOptional()
  maximumSalary: number | null;

  @ApiPropertyOptional()
  salaryCurrency: string | null;

  @ApiPropertyOptional()
  offersTokenAllocation: boolean | null;

  @ApiPropertyOptional()
  featured: boolean | null;

  @ApiPropertyOptional()
  featureStartDate: number | null;

  @ApiPropertyOptional()
  featureEndDate: number | null;

  @ApiPropertyOptional()
  commitment: string | null;

  @ApiProperty()
  timestamp: number | null;

  @ApiPropertyOptional()
  locationType: string | null;

  @ApiPropertyOptional()
  tags: string[];

  constructor(raw: OrgJob) {
    const {
      id,
      shortUUID,
      classification,
      title,
      salary,
      location,
      summary,
      seniority,
      paysInCrypto,
      minimumSalary,
      maximumSalary,
      salaryCurrency,
      offersTokenAllocation,
      commitment,
      featured,
      featureStartDate,
      featureEndDate,
      timestamp,
      locationType,
      tags,
    } = raw;
    this.id = id;
    this.shortUUID = shortUUID;
    this.classification = classification;
    this.title = title;
    this.salary = salary;
    this.location = location;
    this.summary = summary;
    this.seniority = seniority;
    this.paysInCrypto = paysInCrypto;
    this.minimumSalary = minimumSalary;
    this.maximumSalary = maximumSalary;
    this.salaryCurrency = salaryCurrency;
    this.offersTokenAllocation = offersTokenAllocation;
    this.commitment = commitment;
    this.timestamp = timestamp;
    this.locationType = locationType;
    this.featured = featured;
    this.featureStartDate = featureStartDate;
    this.featureEndDate = featureEndDate;
    this.tags = tags;

    const result = OrgJob.OrgJobType.decode(raw);

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `org jobs instance with id ${this.shortUUID} failed validation with error '${x}'`,
        );
      });
    }
  }
}
