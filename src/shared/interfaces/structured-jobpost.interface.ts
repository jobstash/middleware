import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";

export class StructuredJobpost {
  public static readonly StructuredJobpostType = t.strict({
    id: t.string,
    shortUUID: t.string,
    url: t.union([t.string, t.null]),
    access: t.union([t.literal("public"), t.literal("protected")]),
    benefits: t.array(t.string),
    requirements: t.array(t.string),
    onboardIntoWeb3: t.boolean,
    responsibilities: t.array(t.string),
    title: t.union([t.string, t.null]),
    salary: t.union([t.number, t.null]),
    summary: t.union([t.string, t.null]),
    description: t.union([t.string, t.null]),
    culture: t.union([t.string, t.null]),
    location: t.union([t.string, t.null]),
    seniority: t.union([t.string, t.null]),
    paysInCrypto: t.union([t.boolean, t.null]),
    featured: t.union([t.boolean, t.null]),
    featureStartDate: t.union([t.number, t.null]),
    featureEndDate: t.union([t.number, t.null]),
    minimumSalary: t.union([t.number, t.null]),
    maximumSalary: t.union([t.number, t.null]),
    salaryCurrency: t.union([t.string, t.null]),
    timestamp: t.union([t.number, t.null]),
    offersTokenAllocation: t.union([t.boolean, t.null]),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  access: "public" | "protected";

  @ApiPropertyOptional()
  url: string | null;

  @ApiPropertyOptional()
  title: string | null;

  @ApiPropertyOptional()
  summary: string | null;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty()
  requirements: string[];

  @ApiProperty()
  onboardIntoWeb3: boolean;

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
  featured: boolean | null;

  @ApiPropertyOptional()
  featureStartDate: number | null;

  @ApiPropertyOptional()
  featureEndDate: number | null;

  @ApiPropertyOptional()
  offersTokenAllocation: boolean | null;

  @ApiProperty()
  timestamp: number | null;

  constructor(raw: StructuredJobpost) {
    const {
      id,
      url,
      access,
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
      featured,
      featureStartDate,
      featureEndDate,
      requirements,
      minimumSalary,
      maximumSalary,
      salaryCurrency,
      responsibilities,
      timestamp,
      offersTokenAllocation,
    } = raw;

    const result = StructuredJobpost.StructuredJobpostType.decode(raw);

    this.id = id;
    this.url = url;
    this.title = title;
    this.access = access;
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
    this.featured = featured;
    this.featureStartDate = featureStartDate;
    this.featureEndDate = featureEndDate;
    this.salaryCurrency = salaryCurrency;
    this.responsibilities = responsibilities;
    this.timestamp = timestamp;
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
