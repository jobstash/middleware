import {
  LeanOrgReview,
  OrgJob,
  OrgReview,
  OrganizationWithRelations,
  Tag,
} from "../interfaces";
import {
  generateOrgAggregateRating,
  generateOrgAggregateRatings,
  nonZeroOrNull,
  notStringOrNull,
} from "../helpers";
import {
  OrgDetailsResult,
  OrgListResult,
} from "../interfaces/org-details-result.interface";
import { LeanOrgReviewEntity } from "./org-review.entity";
import { OmitType } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { isAfter, isBefore } from "date-fns";
import { uniqBy } from "lodash";
import { OrgJobEntity } from "./structured-jobpost-with-relations.entity";

class RawOrg extends OmitType(OrganizationWithRelations, ["reviews"] as const) {
  reviews: LeanOrgReview[] | OrgReview[] | null;
  tags: Tag[] | null;
  constructor(raw: RawOrg) {
    const { tags, ...orgProperties } = raw;
    super(orgProperties);
    const result = OrgListResult.OrgListResultType.decode(raw);

    this.tags = tags;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `org list result instance with id ${this.orgId} failed validation with error '${x}'`,
        );
      });
    }
  }
}

class RawOrgWithJobs extends RawOrg {
  jobs: OrgJob[] | null;

  constructor(raw: RawOrgWithJobs) {
    const { jobs, ...orgProperties } = raw;
    super(orgProperties);
    const result = OrgDetailsResult.OrgDetailsResultType.decode(raw);

    this.jobs = jobs;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `org list result instance with id ${this.orgId} failed validation with error '${x}'`,
        );
      });
    }
  }
}

export class OrgListResultEntity {
  constructor(private readonly raw: RawOrg) {}

  getProperties(): OrgListResult {
    const organization = this.raw;
    const { investors, fundingRounds, projects, tags, reviews, grants } =
      organization;
    const aggregateRatings =
      reviews?.map(review => generateOrgAggregateRating(review.rating)) ?? [];

    return new OrgListResult({
      ...organization,
      aggregateRating:
        aggregateRatings.length > 0
          ? aggregateRatings.reduce((a, b) => a + b) / aggregateRatings.length
          : 0,
      aggregateRatings: generateOrgAggregateRatings(
        organization?.reviews?.map(x => x.rating) ?? [],
      ),
      reviewCount: reviews?.length ?? 0,
      docs: notStringOrNull(organization?.docs),
      logoUrl: notStringOrNull(organization?.logoUrl),
      location: notStringOrNull(organization?.location),
      headcountEstimate: nonZeroOrNull(organization?.headcountEstimate),
      github: notStringOrNull(organization?.github),
      twitter: notStringOrNull(organization?.twitter),
      discord: notStringOrNull(organization?.discord),
      telegram: notStringOrNull(organization?.telegram),
      createdTimestamp: nonZeroOrNull(organization?.createdTimestamp),
      updatedTimestamp: nonZeroOrNull(organization?.updatedTimestamp),
      projects:
        projects?.map(project => ({
          ...project,
          defiLlamaId: notStringOrNull(project?.defiLlamaId),
          defiLlamaSlug: notStringOrNull(project?.defiLlamaSlug),
          defiLlamaParent: notStringOrNull(project?.defiLlamaParent),
          tokenAddress: notStringOrNull(project?.tokenAddress),
          tokenSymbol: notStringOrNull(project?.tokenSymbol, ["-"]),
          tvl: nonZeroOrNull(project?.tvl),
          monthlyVolume: nonZeroOrNull(project?.monthlyVolume),
          monthlyFees: nonZeroOrNull(project?.monthlyFees),
          monthlyRevenue: nonZeroOrNull(project?.monthlyRevenue),
          monthlyActiveUsers: nonZeroOrNull(project?.monthlyActiveUsers),
          telegram: notStringOrNull(project?.telegram),
          logo: notStringOrNull(project?.logo),
          twitter: notStringOrNull(project?.twitter),
          discord: notStringOrNull(project?.discord),
          docs: notStringOrNull(project?.docs),
          github: notStringOrNull(project?.github),
          createdTimestamp: nonZeroOrNull(project?.createdTimestamp),
          updatedTimestamp: nonZeroOrNull(project?.updatedTimestamp),
          hacks:
            project?.hacks?.map(hack => ({
              ...hack,
              fundsLost: hack.fundsLost,
              date: nonZeroOrNull(hack.date),
              description: notStringOrNull(hack.description),
              fundsReturned: nonZeroOrNull(hack.fundsReturned),
            })) ?? [],
          audits:
            project?.audits?.map(audit => ({
              ...audit,
              id: notStringOrNull(audit?.id),
              name: notStringOrNull(audit?.name),
              defiId: notStringOrNull(audit?.defiId),
              date: nonZeroOrNull(audit?.date),
              techIssues: nonZeroOrNull(audit?.techIssues),
              link: notStringOrNull(audit?.link),
            })) ?? [],
          grants:
            project?.grants?.map(grant => ({
              ...grant,
              //TODO: remove this once we have a better way to handle this
              tokenAmount: nonZeroOrNull(grant?.tokenAmount),
              tokenUnit: notStringOrNull(grant?.tokenUnit),
              programName: notStringOrNull(grant?.programName) ?? "N/A",
              createdTimestamp: nonZeroOrNull(grant?.createdTimestamp),
              updatedTimestamp: nonZeroOrNull(grant?.updatedTimestamp),
              fundingDate: nonZeroOrNull(grant?.fundingDate),
              amount: nonZeroOrNull(grant?.amount),
            })) ?? [],
          fundingRounds:
            project?.fundingRounds?.map(fr => ({
              ...fr,
              raisedAmount: nonZeroOrNull(fr?.raisedAmount),
              createdTimestamp: nonZeroOrNull(fr?.createdTimestamp),
              updatedTimestamp: nonZeroOrNull(fr?.updatedTimestamp),
              roundName: notStringOrNull(fr?.roundName),
              sourceLink: notStringOrNull(fr?.sourceLink),
            })) ?? [],
          chains:
            project.chains.map(chain => ({
              ...chain,
              logo: notStringOrNull(chain?.logo),
            })) ?? [],
          ecosystems: project.ecosystems ?? [],
          jobs:
            project?.jobs?.map(jobpost => {
              const now = new Date().getTime();
              const isStillFeatured =
                jobpost?.featured === true &&
                isAfter(now, nonZeroOrNull(jobpost?.featureStartDate) ?? now) &&
                isBefore(now, nonZeroOrNull(jobpost?.featureEndDate) ?? now);
              return {
                ...jobpost,
                salary: nonZeroOrNull(jobpost?.salary),
                minimumSalary: nonZeroOrNull(jobpost?.minimumSalary),
                maximumSalary: nonZeroOrNull(jobpost?.maximumSalary),
                seniority: notStringOrNull(jobpost?.seniority, [
                  "",
                  "undefined",
                ]),
                culture: notStringOrNull(jobpost?.culture, ["", "undefined"]),
                salaryCurrency: notStringOrNull(jobpost?.salaryCurrency),
                paysInCrypto: jobpost?.paysInCrypto ?? null,
                offersTokenAllocation: jobpost?.offersTokenAllocation ?? null,
                url:
                  jobpost?.access === "protected"
                    ? null
                    : notStringOrNull(jobpost?.url),
                title: notStringOrNull(jobpost?.title),
                summary: notStringOrNull(jobpost?.summary),
                description: notStringOrNull(jobpost?.description),
                commitment: notStringOrNull(jobpost?.commitment),
                timestamp: nonZeroOrNull(jobpost?.timestamp),
                featureStartDate: isStillFeatured
                  ? nonZeroOrNull(jobpost?.featureStartDate)
                  : null,
                featureEndDate: isStillFeatured
                  ? nonZeroOrNull(jobpost?.featureEndDate)
                  : null,
                featured: isStillFeatured,
              };
            }) ?? [],
          repos: project?.repos?.map(repo => ({ ...repo })) ?? [],
        })) ?? [],
      grants:
        grants?.map(grant => ({
          ...grant,
          //TODO: remove this once we have a better way to handle this
          tokenAmount: nonZeroOrNull(grant?.tokenAmount),
          tokenUnit: notStringOrNull(grant?.tokenUnit),
          programName: notStringOrNull(grant?.programName) ?? "N/A",
          createdTimestamp: nonZeroOrNull(grant?.createdTimestamp),
          updatedTimestamp: nonZeroOrNull(grant?.updatedTimestamp),
          fundingDate: nonZeroOrNull(grant?.fundingDate),
          amount: nonZeroOrNull(grant?.amount),
        })) ?? [],
      fundingRounds:
        fundingRounds?.map(fr => ({
          ...fr,
          raisedAmount: nonZeroOrNull(fr?.raisedAmount),
          roundName: notStringOrNull(fr?.roundName),
          sourceLink: notStringOrNull(fr?.sourceLink),
          createdTimestamp: nonZeroOrNull(fr?.createdTimestamp),
          updatedTimestamp: nonZeroOrNull(fr?.updatedTimestamp),
        })) ?? [],
      investors: Array.from(
        uniqBy(
          investors?.map(investor => ({
            id: investor.id,
            name: investor.name,
            normalizedName: investor.normalizedName,
          })) ?? [],
          "id",
        ),
      ),
      community: organization?.community ?? [],
      ecosystems: organization?.ecosystems ?? [],
      tags: tags ?? [],
      reviews:
        reviews?.map(r => new LeanOrgReviewEntity(r).getProperties()) ?? [],
    });
  }
}

export class OrgDetailsResultEntity {
  constructor(private readonly raw: RawOrgWithJobs) {}

  getProperties(): OrgDetailsResult {
    const organization = this.raw;
    const { investors, fundingRounds, projects, tags, reviews, grants, jobs } =
      organization;
    const aggregateRatings =
      reviews?.map(review => generateOrgAggregateRating(review.rating)) ?? [];

    return new OrgDetailsResult({
      ...organization,
      aggregateRating:
        aggregateRatings.length > 0
          ? aggregateRatings.reduce((a, b) => a + b) / aggregateRatings.length
          : 0,
      aggregateRatings: generateOrgAggregateRatings(
        organization?.reviews?.map(x => x.rating) ?? [],
      ),
      reviewCount: reviews?.length ?? 0,
      docs: notStringOrNull(organization?.docs),
      logoUrl: notStringOrNull(organization?.logoUrl),
      location: notStringOrNull(organization?.location),
      headcountEstimate: nonZeroOrNull(organization?.headcountEstimate),
      github: notStringOrNull(organization?.github),
      twitter: notStringOrNull(organization?.twitter),
      discord: notStringOrNull(organization?.discord),
      telegram: notStringOrNull(organization?.telegram),
      createdTimestamp: nonZeroOrNull(organization?.createdTimestamp),
      updatedTimestamp: nonZeroOrNull(organization?.updatedTimestamp),
      projects:
        projects?.map(project => ({
          ...project,
          defiLlamaId: notStringOrNull(project?.defiLlamaId),
          defiLlamaSlug: notStringOrNull(project?.defiLlamaSlug),
          defiLlamaParent: notStringOrNull(project?.defiLlamaParent),
          tokenAddress: notStringOrNull(project?.tokenAddress),
          tokenSymbol: notStringOrNull(project?.tokenSymbol, ["-"]),
          tvl: nonZeroOrNull(project?.tvl),
          monthlyVolume: nonZeroOrNull(project?.monthlyVolume),
          monthlyFees: nonZeroOrNull(project?.monthlyFees),
          monthlyRevenue: nonZeroOrNull(project?.monthlyRevenue),
          monthlyActiveUsers: nonZeroOrNull(project?.monthlyActiveUsers),
          telegram: notStringOrNull(project?.telegram),
          logo: notStringOrNull(project?.logo),
          twitter: notStringOrNull(project?.twitter),
          discord: notStringOrNull(project?.discord),
          docs: notStringOrNull(project?.docs),
          github: notStringOrNull(project?.github),
          createdTimestamp: nonZeroOrNull(project?.createdTimestamp),
          updatedTimestamp: nonZeroOrNull(project?.updatedTimestamp),
          hacks:
            project?.hacks?.map(hack => ({
              ...hack,
              fundsLost: hack.fundsLost,
              date: nonZeroOrNull(hack.date),
              description: notStringOrNull(hack.description),
              fundsReturned: nonZeroOrNull(hack.fundsReturned),
            })) ?? [],
          audits:
            project?.audits?.map(audit => ({
              ...audit,
              id: notStringOrNull(audit?.id),
              name: notStringOrNull(audit?.name),
              defiId: notStringOrNull(audit?.defiId),
              date: nonZeroOrNull(audit?.date),
              techIssues: nonZeroOrNull(audit?.techIssues),
              link: notStringOrNull(audit?.link),
            })) ?? [],
          grants:
            project?.grants?.map(grant => ({
              ...grant,
              //TODO: remove this once we have a better way to handle this
              tokenAmount: nonZeroOrNull(grant?.tokenAmount),
              tokenUnit: notStringOrNull(grant?.tokenUnit),
              programName: notStringOrNull(grant?.programName) ?? "N/A",
              createdTimestamp: nonZeroOrNull(grant?.createdTimestamp),
              updatedTimestamp: nonZeroOrNull(grant?.updatedTimestamp),
              fundingDate: nonZeroOrNull(grant?.fundingDate),
              amount: nonZeroOrNull(grant?.amount),
            })) ?? [],
          fundingRounds:
            project?.fundingRounds?.map(fr => ({
              ...fr,
              raisedAmount: nonZeroOrNull(fr?.raisedAmount),
              createdTimestamp: nonZeroOrNull(fr?.createdTimestamp),
              updatedTimestamp: nonZeroOrNull(fr?.updatedTimestamp),
              roundName: notStringOrNull(fr?.roundName),
              sourceLink: notStringOrNull(fr?.sourceLink),
            })) ?? [],
          chains:
            project.chains.map(chain => ({
              ...chain,
              logo: notStringOrNull(chain?.logo),
            })) ?? [],
          ecosystems: project.ecosystems ?? [],
          jobs:
            project?.jobs?.map(jobpost => {
              const now = new Date().getTime();
              const isStillFeatured =
                jobpost?.featured === true &&
                isAfter(now, nonZeroOrNull(jobpost?.featureStartDate) ?? now) &&
                isBefore(now, nonZeroOrNull(jobpost?.featureEndDate) ?? now);
              return {
                ...jobpost,
                salary: nonZeroOrNull(jobpost?.salary),
                minimumSalary: nonZeroOrNull(jobpost?.minimumSalary),
                maximumSalary: nonZeroOrNull(jobpost?.maximumSalary),
                seniority: notStringOrNull(jobpost?.seniority, [
                  "",
                  "undefined",
                ]),
                culture: notStringOrNull(jobpost?.culture, ["", "undefined"]),
                salaryCurrency: notStringOrNull(jobpost?.salaryCurrency),
                paysInCrypto: jobpost?.paysInCrypto ?? null,
                offersTokenAllocation: jobpost?.offersTokenAllocation ?? null,
                url:
                  jobpost?.access === "protected"
                    ? null
                    : notStringOrNull(jobpost?.url),
                title: notStringOrNull(jobpost?.title),
                summary: notStringOrNull(jobpost?.summary),
                description: notStringOrNull(jobpost?.description),
                commitment: notStringOrNull(jobpost?.commitment),
                timestamp: nonZeroOrNull(jobpost?.timestamp),
                featureStartDate: isStillFeatured
                  ? nonZeroOrNull(jobpost?.featureStartDate)
                  : null,
                featureEndDate: isStillFeatured
                  ? nonZeroOrNull(jobpost?.featureEndDate)
                  : null,
                featured: isStillFeatured,
              };
            }) ?? [],
          repos: project?.repos?.map(repo => ({ ...repo })) ?? [],
        })) ?? [],
      grants:
        grants?.map(grant => ({
          ...grant,
          //TODO: remove this once we have a better way to handle this
          tokenAmount: nonZeroOrNull(grant?.tokenAmount),
          tokenUnit: notStringOrNull(grant?.tokenUnit),
          programName: notStringOrNull(grant?.programName) ?? "N/A",
          createdTimestamp: nonZeroOrNull(grant?.createdTimestamp),
          updatedTimestamp: nonZeroOrNull(grant?.updatedTimestamp),
          fundingDate: nonZeroOrNull(grant?.fundingDate),
          amount: nonZeroOrNull(grant?.amount),
        })) ?? [],
      fundingRounds:
        fundingRounds?.map(fr => ({
          ...fr,
          raisedAmount: nonZeroOrNull(fr?.raisedAmount),
          roundName: notStringOrNull(fr?.roundName),
          sourceLink: notStringOrNull(fr?.sourceLink),
          createdTimestamp: nonZeroOrNull(fr?.createdTimestamp),
          updatedTimestamp: nonZeroOrNull(fr?.updatedTimestamp),
        })) ?? [],
      investors: Array.from(
        uniqBy(
          investors?.map(investor => ({
            id: investor.id,
            name: investor.name,
            normalizedName: investor.normalizedName,
          })) ?? [],
          "id",
        ),
      ),
      community: organization?.community ?? [],
      ecosystems: organization?.ecosystems ?? [],
      tags: tags ?? [],
      reviews:
        reviews?.map(r => new LeanOrgReviewEntity(r).getProperties()) ?? [],
      jobs: jobs.map(x => new OrgJobEntity(x).getProperties()) ?? [],
    });
  }
}
