import { OrganizationWithLinks } from "../interfaces";
import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { isAfter, isBefore } from "date-fns";

export class OrganizationWithLinksEntity {
  constructor(private readonly raw: OrganizationWithLinks) {}

  getProperties(): OrganizationWithLinks {
    const organization = this.raw;
    const {
      jobCount,
      openEngineeringJobCount,
      totalEngineeringJobCount,
      discord,
      website,
      rawWebsite,
      telegram,
      github,
      aliases,
      twitter,
      docs,
      projects,
      fundingRounds,
      investors,
      community,
      detectedJobsite,
      jobsite,
      grant,
    } = organization;

    return new OrganizationWithLinks({
      ...organization,
      jobCount: jobCount ?? 0,
      openEngineeringJobCount: openEngineeringJobCount ?? 0,
      totalEngineeringJobCount: totalEngineeringJobCount ?? 0,
      docs: docs ?? [],
      logoUrl: notStringOrNull(organization?.logoUrl),
      location: notStringOrNull(organization?.location),
      headcountEstimate: nonZeroOrNull(organization?.headcountEstimate),
      github: github ?? [],
      twitter: twitter ?? [],
      discord: discord ?? [],
      telegram: telegram ?? [],
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
                url: notStringOrNull(jobpost?.url),
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
          investors:
            project?.investors ??
            organization?.investors?.map(investor => ({
              id: investor.id,
              name: investor.name,
              normalizedName: investor.normalizedName,
            })) ??
            [],
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
      investors:
        investors?.map(investor => ({
          id: investor.id,
          name: investor.name,
          normalizedName: investor.normalizedName,
        })) ?? [],
      community: community ?? [],
      website: website ?? [],
      rawWebsite: rawWebsite ?? [],
      aliases: aliases ?? [],
      detectedJobsite:
        detectedJobsite.map(detectedJobsite => ({
          id: detectedJobsite.id,
          url: detectedJobsite.url,
          type: detectedJobsite.type,
        })) ?? [],
      jobsite:
        jobsite.map(jobsite => ({
          id: jobsite.id,
          url: jobsite.url,
          type: jobsite.type,
        })) ?? [],
      grant: grant ?? [],
    });
  }
}
