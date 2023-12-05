import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class OrgInfo {
  public static readonly OrgInfoType = t.strict({
    id: t.string,
    name: t.string,
    description: t.string,
    orgId: t.string,
    location: t.string,
    summary: t.string,
    altName: t.union([t.string, t.null]),
    jobsiteLink: t.union([t.string, t.null]),
    updatedTimestamp: t.union([t.string, t.null]),
    github: t.union([t.string, t.null]),
    twitter: t.union([t.string, t.null]),
    discord: t.union([t.string, t.null]),
    docs: t.union([t.string, t.null]),
    website: t.union([t.string, t.null]),
    telegram: t.union([t.string, t.null]),
    headCount: t.union([t.string, t.null]),
    logo: t.union([t.string, t.null]),
  });

  id: string;
  name: string;
  description: string;
  orgId: string;
  location: string;
  summary: string;
  altName: string | null;
  jobsiteLink: string | null;
  updatedTimestamp: number | null;
  github: string | null;
  twitter: string | null;
  website: string | null;
  discord: string | null;
  docs: string | null;
  telegram: string | null;
  headCount: number | null;
  logo: string | null;

  constructor(raw: OrgInfo) {
    const {
      id,
      name,
      description,
      orgId,
      location,
      summary,
      altName,
      jobsiteLink,
      updatedTimestamp,
      github,
      twitter,
      discord,
      docs,
      website,
      telegram,
      headCount,
      logo,
    } = raw;

    const result = OrgInfo.OrgInfoType.decode(raw);

    this.id = id;
    this.name = name;
    this.description = description;
    this.orgId = orgId;
    this.location = location;
    this.summary = summary;
    this.altName = altName;
    this.jobsiteLink = jobsiteLink;
    this.updatedTimestamp = updatedTimestamp;
    this.github = github;
    this.twitter = twitter;
    this.discord = discord;
    this.website = website;
    this.docs = docs;
    this.telegram = telegram;
    this.headCount = headCount;
    this.logo = logo;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `org info instance with id ${this.orgId} failed validation with error '${x}'`,
        );
      });
    }
  }
}
