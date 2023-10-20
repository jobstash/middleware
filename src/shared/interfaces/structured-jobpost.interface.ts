import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";

export class StructuredJobpost {
  public static readonly StructuredJobpostType = t.strict({
    id: t.string,
    url: t.string,
    shortUUID: t.string,
    benefits: t.array(t.string),
    requirements: t.array(t.string),
    responsibilities: t.array(t.string),
    title: t.union([t.string, t.null]),
    salary: t.union([t.number, t.null]),
    summary: t.union([t.string, t.null]),
    description: t.union([t.string, t.null]),
    culture: t.union([t.string, t.null]),
    location: t.union([t.string, t.null]),
    seniority: t.union([t.string, t.null]),
    paysInCrypto: t.union([t.boolean, t.null]),
    minimumSalary: t.union([t.number, t.null]),
    maximumSalary: t.union([t.number, t.null]),
    salaryCurrency: t.union([t.string, t.null]),
    publishedTimestamp: t.union([t.number, t.null]),
    offersTokenAllocation: t.union([t.boolean, t.null]),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  url: string;

  @ApiProperty()
  title: string | null;

  @ApiPropertyOptional()
  summary: string | null;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty()
  requirements: string[];

  @ApiProperty()
  responsibilities: string[];

  @ApiProperty()
  shortUUID: string;

  @ApiPropertyOptional()
  minimumSalary: number | null;

  @ApiPropertyOptional()
  maximumSalary: number | null;

  @ApiPropertyOptional()
  salary: number | null;

  @ApiPropertyOptional()
  seniority: string | null;

  @ApiProperty()
  benefits: string[];

  @ApiPropertyOptional()
  culture: string | null;

  @ApiPropertyOptional()
  location: string | null;

  @ApiPropertyOptional()
  salaryCurrency: string | null;

  @ApiPropertyOptional()
  paysInCrypto: boolean | null;

  @ApiPropertyOptional()
  offersTokenAllocation: boolean | null;

  @ApiProperty()
  publishedTimestamp: number | null;

  constructor(raw: StructuredJobpost) {
    const {
      id,
      url,
      title,
      salary,
      culture,
      location,
      summary,
      description,
      benefits,
      shortUUID,
      seniority,
      paysInCrypto,
      requirements,
      minimumSalary,
      maximumSalary,
      salaryCurrency,
      responsibilities,
      publishedTimestamp,
      offersTokenAllocation,
    } = raw;

    const result = StructuredJobpost.StructuredJobpostType.decode(raw);

    this.id = id;
    this.url = url;
    this.title = title;
    this.salary = salary;
    this.culture = culture;
    this.location = location;
    this.summary = summary;
    this.benefits = benefits;
    this.shortUUID = shortUUID;
    this.seniority = seniority;
    this.description = description;
    this.requirements = requirements;
    this.paysInCrypto = paysInCrypto;
    this.minimumSalary = minimumSalary;
    this.maximumSalary = maximumSalary;
    this.salaryCurrency = salaryCurrency;
    this.responsibilities = responsibilities;
    this.publishedTimestamp = publishedTimestamp;
    this.offersTokenAllocation = offersTokenAllocation;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `structured jobpost instance with id ${this.shortUUID} failed validation with error '${x}'`,
        );
      });
    }
  }
}
