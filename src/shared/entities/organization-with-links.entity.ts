import { OrganizationWithLinks } from "../interfaces";
import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { isAfter, isBefore } from "date-fns";

export class OrganizationWithLinksEntity {
  constructor(private readonly raw: OrganizationWithLinks) {}

  getProperties(): OrganizationWithLinks {
    const organization = this.raw;
    const {
      discords,
      websites,
      telegrams,
      githubs,
      aliases,
      twitters,
      docs,
      projects,
      communities,
      detectedJobsites,
      jobsites,
      grants,
    } = organization;

    return new OrganizationWithLinks({
      ...organization,
      docs: docs ?? [],
      logoUrl: notStringOrNull(organization?.logoUrl),
      location: notStringOrNull(organization?.location),
      headcountEstimate: nonZeroOrNull(organization?.headcountEstimate),
      githubs: githubs ?? [],
      twitters: twitters ?? [],
      discords: discords ?? [],
      telegrams: telegrams ?? [],
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
          isMainnet: project?.isMainnet ?? null,
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
      communities: communities ?? [],
      websites: websites ?? [],
      aliases: aliases ?? [],
      detectedJobsites:
        detectedJobsites.map(detectedJobsite => ({
          id: detectedJobsite.id,
          url: detectedJobsite.url,
          type: detectedJobsite.type,
        })) ?? [],
      jobsites:
        jobsites.map(jobsite => ({
          id: jobsite.id,
          url: jobsite.url,
          type: jobsite.type,
        })) ?? [],
      grants: grants ?? [],
    });
  }
}
