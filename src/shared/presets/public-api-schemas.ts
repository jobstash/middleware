import { getSchemaPath } from "@nestjs/swagger";
import {
  RangeFilter,
  MultiSelectFilter,
  SingleSelectFilter,
  ProjectMoreInfo,
  Hack,
  Audit,
  Chain,
  StructuredJobpostWithRelations,
  Investor,
  Repository,
  ProjectWithRelations,
  FundingRound,
  OrgReview,
  GrantFunding,
} from "../interfaces";

export const PUBLIC_API_SCHEMAS = {
  Response: {
    type: "object",
    properties: {
      success: {
        type: "boolean",
      },
      message: {
        type: "string",
      },
      data: {
        type: "object",
      },
    },
  },
  RangeFilter: {
    type: "object",
    properties: {
      show: {
        type: "boolean",
      },
      position: {
        type: "number",
      },
      paramKey: {
        type: "string",
      },
      label: {
        type: "string",
      },
      googleAnalyticsEventName: {
        type: "string",
      },
      kind: {
        type: "string",
      },
      value: {
        type: "object",
        properties: {
          lowest: {
            type: "object",
            properties: {
              value: {
                type: "number",
              },
              paramKey: {
                type: "string",
              },
            },
          },
          highest: {
            type: "object",
            properties: {
              value: {
                type: "number",
              },
              paramKey: {
                type: "string",
              },
            },
          },
        },
      },
    },
  },
  SingleSelectFilter: {
    type: "object",
    properties: {
      show: {
        type: "boolean",
      },
      position: {
        type: "number",
      },
      paramKey: {
        type: "string",
      },
      label: {
        type: "string",
      },
      googleAnalyticsEventName: {
        type: "string",
      },
      kind: {
        type: "string ",
      },
      options: {
        type: "array",
        items: {
          type: "object",
          properties: {
            value: {
              type: "string",
            },
            label: {
              type: "string",
            },
          },
        },
      },
    },
  },
  MultiSelectFilter: {
    type: "object",
    properties: {
      show: {
        type: "boolean",
      },
      position: {
        type: "number",
      },
      paramKey: {
        type: "string",
      },
      label: {
        type: "string",
      },
      googleAnalyticsEventName: {
        type: "string",
      },
      kind: {
        type: "string",
      },
      options: {
        type: "array",
        items: {
          type: "string",
        },
      },
    },
  },
  PaginatedData: {
    type: "object",
    properties: {
      page: {
        type: "number",
      },
      count: {
        type: "number",
      },
      data: {
        type: "array",
        items: {},
      },
    },
  },
  ValidationError: {
    type: "object",
    properties: {
      message: {
        type: "string",
      },
      errors: {
        type: "array",
        items: {
          type: "object",
          properties: {
            path: {
              type: "string",
            },
            message: {
              type: "string",
            },
          },
        },
      },
    },
  },
  ResponseWithNoData: {
    description: "Response with no data",
    allOf: [
      {
        $ref: getSchemaPath(Response),
      },
    ],
  },
  FundingRound: {
    type: "object",
    properties: {
      id: {
        description: "The unique internal uuid of the funding round",
        type: "string",
        example: "6e62a5a8-49a0-4606-8112-6b43de8a4d89",
      },
      date: {
        description: "The date of the funding round",
        type: "number",
        example: 1650963200,
      },
      createdTimestamp: {
        description: "The timestamp of when the funding round was created",
        type: "number",
        example: 1650963200,
      },
      roundName: {
        description: "The name of the funding round",
        type: "string",
        example: "Series A",
      },
      sourceLink: {
        description: "The link to the source of the funding round data",
        type: "string",
        example: "https://example.com",
      },
      raisedAmount: {
        description: "The amount raised in the funding round",
        type: "number",
        example: 10000,
      },
      updatedTimestamp: {
        description: "The timestamp of when the funding round was last updated",
        type: "number",
        example: 1650963200,
      },
    },
  },
  Investor: {
    type: "object",
    properties: {
      id: {
        description: "The unique internal uuid of the investor",
        type: "string",
        example: "6e62a5a8-49a0-4606-8112-6b43de8a4d89",
      },
      name: {
        description: "The name of the investor",
        type: "string",
        example: "Example Investor",
      },
      normalizedName: {
        description: "The normalized name of the investor",
        type: "string",
        example: "example-investor",
      },
    },
  },
  Chain: {
    type: "object",
    properties: {
      id: {
        description: "The unique internal uuid of the chain",
        type: "string",
        example: "6e62a5a8-49a0-4606-8112-6b43de8a4d89",
      },
      name: {
        description: "The name of the chain",
        type: "string",
        example: "Example Chain",
      },
      normalizedName: {
        description: "The normalized name of the chain",
        type: "string",
        example: "example-chain",
      },
      logo: {
        description: "The url of the chain's logo",
        type: "string",
        example: "https://example.com/logo.png",
      },
    },
  },
  Audit: {
    type: "object",
    properties: {
      id: {
        description: "The unique internal uuid of the audit",
        type: "string",
        example: "6e62a5a8-49a0-4606-8112-6b43de8a4d89",
      },
      name: {
        description: "The name of the audit",
        type: "string",
        example: "Example Audit",
      },
      defiId: {
        description: "The id of the audit on DefiLlama",
        type: "string",
        example: "3345",
      },
      date: {
        description: "The date of the audit",
        type: "number",
        example: 1650963200,
      },
      techIssues: {
        description: "The number of technical issues found in the audit",
        type: "number",
        example: 100,
      },
      link: {
        description: "The link to the audit report",
        type: "string",
        example: "https://example.com/audit",
      },
    },
  },
  Hack: {
    type: "object",
    properties: {
      id: {
        description: "The unique internal uuid of the hack",
        type: "string",
        example: "6e62a5a8-49a0-4606-8112-6b43de8a4d89",
      },
      date: {
        description: "The date of the hack",
        type: "number",
        example: 1650963200,
      },
      defiId: {
        description: "The id of the hack on DefiLlama",
        type: "string",
        example: "3345",
      },
      category: {
        description: "The category of the hack",
        type: "string",
        example: "Category",
      },
      fundsLost: {
        description: "The amount of funds lost in the hack",
        type: "number",
        example: 10000,
      },
      issueType: {
        description: "The type of issue the hack was targeting",
        type: "string",
        example: "Issue Type",
      },
      description: {
        description: "The description of the hack",
        type: "string",
        example: "Description",
      },
      fundsReturned: {
        description: "The amount of funds retrieved after the hack",
        type: "number",
        example: 10000,
      },
    },
  },
  Repository: {
    type: "object",
    properties: {
      id: {
        description: "The unique internal uuid of the repository",
        type: "string",
        example: "6e62a5a8-49a0-4606-8112-6b43de8a4d89",
      },
      name: {
        description: "The name of the repository",
        type: "string",
        example: "Example Repository",
      },
      fullName: {
        description: "The full name of the repository",
        type: "string",
        example: "example-repository",
      },
      description: {
        description: "The description of the repository",
        type: "string",
        example: "Example Repository",
      },
      fork: {
        description: "Whether the repository is a fork",
        type: "boolean",
        example: true,
      },
      homepage: {
        description: "The homepage of the repository",
        type: "string",
        example: "https://example.com",
      },
      language: {
        description: "The language of the repository",
        type: "string",
        example: "Example Repository",
      },
      forksCount: {
        description: "The number of forks of the repository",
        type: "number",
        example: 100,
      },
      stargazersCount: {
        description: "The number of stargazers of the repository",
        type: "number",
        example: 100,
      },
      watchersCount: {
        description: "The number of watchers of the repository",
        type: "number",
        example: 100,
      },
      size: {
        description: "The size of the repository",
        type: "number",
        example: 100,
      },
      defaultBranch: {
        description: "The default branch of the repository",
        type: "string",
        example: "Example Repository",
      },
      openIssuesCount: {
        description: "The number of open issues of the repository",
        type: "number",
        example: 100,
      },
      archived: {
        description: "Whether the repository is archived",
        type: "boolean",
        example: true,
      },
      disabled: {
        description: "Whether the repository is disabled",
        type: "boolean",
        example: true,
      },
      pushedAt: {
        description:
          "The timestamp of when the last push to the repository was made",
        type: "number",
        example: 1650963200,
      },
      createdAt: {
        description: "The timestamp of when the repository was created",
        type: "number",
        example: 1650963200,
      },
      updatedAt: {
        description: "The timestamp of when the repository was last updated",
        type: "number",
        example: 1650963200,
      },
    },
  },
  StructuredJobpostWithRelations: {
    type: "object",
    properties: {
      id: {
        description: "The unique internal uuid of the job",
        type: "string",
        example: "6e62a5a8-49a0-4606-8112-6b43de8a4d89",
      },
      shortUUID: {
        description: "The short uuid of the job",
        type: "string",
        example: "CLHgEq",
      },
      url: {
        description: "The url of the job apply page",
        type: "string",
        example: "https://example.com",
      },
      access: {
        description: "The access level of the job",
        type: "string",
        example: "public",
      },
      title: {
        description: "The title of the job",
        type: "string",
        example: "Example Job",
      },
      summary: {
        description: "A summary of the job",
        type: "string",
        example: "Example Job",
      },
      description: {
        description: "A description of the job",
        type: "string",
        example: "Example Job",
      },
      requirements: {
        description: "The requirements of the job",
        type: "array",
        items: {
          type: "string",
          example: "Example Job",
        },
      },
      onboardIntoWeb3: {
        description: "Whether the job onboards new comers into Web3",
        type: "boolean",
        example: true,
      },
      responsibilities: {
        description: "The responsibilities of the job",
        type: "array",
        items: {
          type: "string",
          example: "Example Job",
        },
      },
      salary: {
        description: "The salary of the job",
        type: "number",
        example: 10000,
      },
      culture: {
        description: "The culture of the organization",
        type: "string",
        example: "Example Job",
      },
      location: {
        description: "The location of the job",
        type: "string",
        example: "Example Job",
      },
      seniority: {
        description: "The required seniority level for the job",
        type: "string",
        example: "Example Job",
      },
      paysInCrypto: {
        description: "Whether the job pays in crypto",
        type: "boolean",
        example: true,
      },
      featured: {
        description: "Whether the job is featured",
        type: "boolean",
        example: true,
      },
      featureStartDate: {
        description: "The start date of the job's feature",
        type: "number",
        example: 1650963200,
      },
      featureEndDate: {
        description: "The end date of the job's feature",
        type: "number",
        example: 1650963200,
      },
      minimumSalary: {
        description: "The minimum salary of the job",
        type: "number",
        example: 10000,
      },
      maximumSalary: {
        description: "The maximum salary of the job",
        type: "number",
        example: 10000,
      },
      salaryCurrency: {
        description: "The currency of the job's salary",
        type: "string",
        example: "Example Job",
      },
      timestamp: {
        description: "The timestamp of when the job was created",
        type: "number",
        example: 1650963200,
      },
      offersTokenAllocation: {
        description: "Whether the job offers token allocation as compensation",
        type: "boolean",
        example: true,
      },
      classification: {
        description: "The classification of the job",
        type: "string",
        example: "ENGINEERING",
      },
      commitment: {
        description: "The commitment of the job",
        type: "string",
        example: "FULL_TIME",
      },
      tags: {
        description: "The tags and skills associated with the job",
        type: "array",
        items: {
          type: "object",
          properties: {
            name: {
              description: "The name of the tag",
              type: "string",
              example: "Example Tag",
            },
            normalizedName: {
              description: "The normalized name of the tag",
              type: "string",
              example: "example-tag",
            },
          },
        },
        example: [
          {
            name: "Example Tag",
            normalizedName: "example-tag",
          },
        ],
      },
      locationType: {
        description: "The location type of the job",
        type: "string",
        example: "REMOTE",
      },
    },
  },
  ProjectMoreInfo: {
    type: "object",
    properties: {
      id: {
        description: "The unique internal uuid of the project",
        type: "string",
        example: "6e62a5a8-49a0-4606-8112-6b43de8a4d89",
      },
      name: {
        description: "The name of the project",
        type: "string",
        example: "Example Project",
      },
      normalizedName: {
        description: "The normalized name of the project",
        type: "string",
        example: "example-project",
      },
      logo: {
        description: "The url of the project's logo",
        type: "string",
        example: "https://example.com/logo.png",
      },
      tokenSymbol: {
        description: "The token symbol of the project",
        type: "string",
        example: "EXAMPLE",
      },
      tvl: {
        description: "The total value locked in the project",
        type: "number",
        example: 10000,
      },
      monthlyVolume: {
        description: "The monthly volume of the project",
        type: "number",
        example: 10000,
      },
      monthlyFees: {
        description: "The monthly fees of the project",
        type: "number",
        example: 10000,
      },
      monthlyRevenue: {
        description: "The monthly revenue of the project",
        type: "number",
        example: 10000,
      },
      monthlyActiveUsers: {
        description: "The monthly active users of the project",
        type: "number",
        example: 10000,
      },
      orgId: {
        description:
          "The unique internal id of the organization that owns the project",
        type: "string",
        example: "128",
      },
      description: {
        description: "A description of the project",
        type: "string",
        example: "Example Project",
      },
      defiLlamaId: {
        description: "The id of the project on DefiLlama",
        type: "string",
        example: "3345",
      },
      defiLlamaSlug: {
        description: "The slug of the project on DefiLlama",
        type: "string",
        example: "example-project",
      },
      defiLlamaParent: {
        description: "The parent of the project on DefiLlama",
        type: "string",
        example: "Example",
      },
      tokenAddress: {
        description: "The address of the token used in the project",
        type: "string",
        example: "0x0000000000000000000000000000000000000000",
      },
      createdTimestamp: {
        description: "The timestamp of when the project was created",
        type: "number",
        example: 1650963200,
      },
      updatedTimestamp: {
        description: "The timestamp of when the project was last updated",
        type: "number",
        example: 1650963200,
      },
    },
  },
  ProjectWithRelations: {
    allOf: [
      {
        $ref: getSchemaPath(ProjectMoreInfo),
      },
      {
        type: "object",
        properties: {
          github: {
            description: "The url of the project's github repository",
            type: "string",
            example: "https://github.com/example/example",
          },
          website: {
            description: "The url of the project's website",
            type: "string",
            example: "https://example.com",
          },
          docs: {
            description: "The url of the project's documentation",
            type: "string",
            example: "https://docs.example.com",
          },
          category: {
            description: "The category of the project as defined by DefiLlama",
            type: "string",
            example: "Dexes",
          },
          twitter: {
            description: "The url of the project's twitter profile",
            type: "string",
            example: "https://twitter.com/example",
          },
          discord: {
            description: "The url of the project's discord server",
            type: "string",
            example: "https://discord.gg/example",
          },
          telegram: {
            description: "The url of the project's telegram group",
            type: "string",
            example: "https://t.me/example",
          },
          hacks: {
            description: "The list of hacks the project has fallen victim to",
            type: "array",
            items: {
              $ref: getSchemaPath(Hack),
            },
          },
          audits: {
            description: "The list of audits the project has had done",
            type: "array",
            items: {
              $ref: getSchemaPath(Audit),
            },
          },
          chains: {
            description: "The list of chains the project has been deployed on",
            type: "array",
            items: {
              $ref: getSchemaPath(Chain),
            },
          },
          ecosystems: {
            description:
              "The list of ecosystems the chains project is deployed on belong to",
            type: "array",
            items: {
              type: "string",
            },
          },
          jobs: {
            description: "The list of open positions the project has",
            type: "array",
            items: {
              $ref: getSchemaPath(StructuredJobpostWithRelations),
            },
          },
          investors: {
            description: "The list of investors the project has",
            type: "array",
            items: {
              $ref: getSchemaPath(Investor),
            },
          },
          repos: {
            description: "The list of repositories the project has",
            type: "array",
            items: { $ref: getSchemaPath(Repository) },
          },
        },
      },
    ],
  },
  OrgReview: {
    type: "object",
    properties: {
      id: {
        description: "The unique internal uuid of the review",
        type: "string",
        example: "6e62a5a8-49a0-4606-8112-6b43de8a4d89",
      },
      membershipStatus: {
        description: "The membership status of the reviewer",
        type: "string",
        example: "Active",
      },
      startDate: {
        description: "The start date of the reviewers time at the company",
        type: "number",
        example: 1650963200,
      },
      endDate: {
        description: "The end date of the reviewers time at the company",
        type: "number",
        example: 1650963200,
      },
      commitCount: {
        description:
          "The number of commits made by the reviewer across the organizations repositories",
        type: "number",
        example: 100,
      },
      compensation: {
        description: "The compensation of the reviewer at the company",
        type: "object",
        example: {
          compensationType: "Base",
          compensationValue: 10000,
          compensationCurrency: "USD",
        },
      },
      rating: {
        description: "The rating given by the reviewer",
        type: "object",
        example: {
          benefits: 4.5,
          careerGrowth: 4.5,
          competency: 4.5,
          diversityInclusion: 4.5,
          management: 4.5,
          onboarding: 4.5,
          product: 4.5,
        },
      },
      review: {
        description: "The review of the reviewer",
        type: "object",
        example: {
          id: "6e62a5a8-49a0-4606-8112-6b43de8a4d89",
          title: "Example Review",
          location: "ONSITE",
          timezone: "GMT-05",
          pros: "Great job!",
          cons: "Needs improvement",
        },
      },
    },
  },
  GrantFunding: {
    type: "object",
    properties: {
      id: {
        description: "The unique internal uuid of the grant",
        type: "string",
        example: "6e62a5a8-49a0-4606-8112-6b43de8a4d89",
      },
      tokenAmount: {
        description: "The amount of tokens received in the grant",
        type: "number",
        example: 10000,
      },
      tokenUnit: {
        description: "The unit of the token received in the grant",
        type: "string",
        example: "ETH",
      },
      fundingDate: {
        description: "The date the grant was funded",
        type: "number",
        example: 1650963200,
      },
      amount: {
        description: "The amount of money received in the grant",
        type: "number",
        example: 10000,
      },
      programName: {
        description: "The name of the grant program",
        type: "string",
        example: "Example Program",
      },
      createdTimestamp: {
        description: "The timestamp of when the grant was created",
        type: "number",
        example: 1650963200,
      },
      updatedTimestamp: {
        description: "The timestamp of when the grant was last updated",
        type: "number",
        example: 1650963200,
      },
    },
  },
  JobListResult: {
    allOf: [
      {
        $ref: getSchemaPath(StructuredJobpostWithRelations),
      },
      {
        type: "object",
        properties: {
          organization: {
            properties: {
              id: {
                description: "The unique internal uuid of the organization",
                type: "string",
                example: "6e62a5a8-49a0-4606-8112-6b43de8a4d89",
              },
              orgId: {
                description: "The unique internal id of the organization",
                type: "string",
                example: "123",
              },
              name: {
                description: "The name of the organization",
                type: "string",
                example: "Example Organization",
              },
              normalizedName: {
                description: "The normalized name of the organization",
                type: "string",
                example: "example-organization",
              },
              location: {
                description: "The location of the organization",
                type: "string",
                example: "San Francisco, CA",
              },
              summary: {
                description: "A summary of the organization",
                type: "string",
                example: "Example Organization",
              },
              description: {
                description: "A description of the organization",
                type: "string",
                example: "Example Organization",
              },
              logoUrl: {
                description: "The url of the organization's logo",
                type: "string",
                example: "https://example.com/logo.png",
              },
              headcountEstimate: {
                description: "The estimated headcount of the organization",
                type: "number",
                example: 100,
              },
              createdTimestamp: {
                description:
                  "The timestamp of when the organization was created",
                type: "number",
                example: 1650963200,
              },
              updatedTimestamp: {
                description:
                  "The timestamp of when the organization was last updated",
                type: "number",
                example: 1650963200,
              },
              aggregateRating: {
                description: "The aggregate rating of the organization",
                type: "number",
                example: 4.5,
              },
              aggregateRatings: {
                description: "The aggregate ratings of the organization",
                type: "object",
                example: {
                  benefits: 4.5,
                  careerGrowth: 4.5,
                  competency: 4.5,
                  diversityInclusion: 4.5,
                  management: 4.5,
                  onboarding: 4.5,
                  product: 4.5,
                },
              },
              reviewCount: {
                description: "The number of reviews for the organization",
                type: "number",
                example: 100,
              },
              discord: {
                description: "The url of the organization's discord server",
                type: "string",
                example: "https://example.com/discord",
              },
              website: {
                description: "The url of the organization's website",
                type: "string",
                example: "https://example.com",
              },
              telegram: {
                description: "The url of the organization's telegram group",
                type: "string",
                example: "https://example.com/telegram",
              },
              github: {
                description: "The url of the organization's github repository",
                type: "string",
                example: "https://example.com/github",
              },
              aliases: {
                description: "The list of aliases for the organization",
                type: "array",
                items: {
                  type: "string",
                },
                example: ["Example Organization", "Example Organization"],
              },
              twitter: {
                description: "The url of the organization's twitter profile",
                type: "string",
                example: "https://example.com/twitter",
              },
              docs: {
                description: "The url of the organization's documentation",
                type: "string",
                example: "https://example.com/docs",
              },
              community: {
                description:
                  "The list of communities the organization belongs to",
                type: "array",
                items: {
                  type: "string",
                },
                example: ["LobsterDAO", "EthDam"],
              },
              grants: {
                description: "The list of grants the organization has received",
                type: "array",
                items: {
                  $ref: getSchemaPath(GrantFunding),
                },
              },
              projects: {
                description:
                  "The list of projects the organization has created",
                type: "array",
                items: {
                  $ref: getSchemaPath(ProjectWithRelations),
                },
              },
              fundingRounds: {
                description:
                  "The list of funding rounds the organization has applied for",
                type: "array",
                items: {
                  $ref: getSchemaPath(FundingRound),
                },
              },
              investors: {
                description:
                  "The list of investors the organization has applied for",
                type: "array",
                items: {
                  $ref: getSchemaPath(Investor),
                },
              },
              reviews: {
                description:
                  "The list of reviews the organization has received",
                type: "array",
                items: {
                  $ref: getSchemaPath(OrgReview),
                },
              },
              hasUser: {
                description: "Whether the organization has a user",
                type: "boolean",
              },
              atsClient: {
                description:
                  "The name of the ATS client used by the organization",
                type: "string",
              },
            },
          },
          project: {
            description: "The project the job is associated with",
            type: "object",
            properties: {
              id: {
                description: "The unique internal uuid of the project",
                type: "string",
                example: "6e62a5a8-49a0-4606-8112-6b43de8a4d89",
              },
              name: {
                description: "The name of the project",
                type: "string",
                example: "Example Project",
              },
              normalizedName: {
                description: "The normalized name of the project",
                type: "string",
                example: "example-project",
              },
              logo: {
                description: "The url of the project's logo",
                type: "string",
                example: "https://example.com/logo.png",
              },
              tokenSymbol: {
                description: "The token symbol of the project",
                type: "string",
                example: "EXAMPLE",
              },
              tvl: {
                description: "The total value locked in the project",
                type: "number",
                example: 10000,
              },
              monthlyVolume: {
                description: "The monthly volume of the project",
                type: "number",
                example: 10000,
              },
              monthlyFees: {
                description: "The monthly fees of the project",
                type: "number",
                example: 10000,
              },
              monthlyRevenue: {
                description: "The monthly revenue of the project",
                type: "number",
                example: 10000,
              },
              monthlyActiveUsers: {
                description: "The monthly active users of the project",
                type: "number",
                example: 10000,
              },
              orgIds: {
                description:
                  "The list of unique internal ids of the organizations that own the project",
                type: "array",
                items: {
                  type: "string",
                },
                example: ["128", "129"],
              },
              description: {
                description: "A description of the project",
                type: "string",
                example: "Example Project",
              },
              defiLlamaId: {
                description: "The id of the project on DefiLlama",
                type: "string",
                example: "3345",
              },
              defiLlamaSlug: {
                description: "The slug of the project on DefiLlama",
                type: "string",
                example: "example-project",
              },
              defiLlamaParent: {
                description: "The parent of the project on DefiLlama",
                type: "string",
                example: "Example",
              },
              tokenAddress: {
                description: "The address of the token used in the project",
                type: "string",
                example: "0x0000000000000000000000000000000000000000",
              },
              createdTimestamp: {
                description: "The timestamp of when the project was created",
                type: "number",
                example: 1650963200,
              },
              updatedTimestamp: {
                description:
                  "The timestamp of when the project was last updated",
                type: "number",
                example: 1650963200,
              },
              github: {
                description: "The url of the project's github repository",
                type: "string",
                example: "https://example.com/github",
              },
              website: {
                description: "The url of the project's website",
                type: "string",
                example: "https://example.com",
              },
              docs: {
                description: "The url of the project's documentation",
                type: "string",
                example: "https://example.com/docs",
              },
              category: {
                description: "The category of the project",
                type: "string",
                example: "Dexes",
              },
              twitter: {
                description: "The url of the project's twitter profile",
                type: "string",
                example: "https://twitter.com/example",
              },
              discord: {
                description: "The url of the project's discord server",
                type: "string",
                example: "https://discord.gg/example",
              },
              telegram: {
                description: "The url of the project's telegram channel",
                type: "string",
                example: "https://t.me/example",
              },
              hacks: {
                description:
                  "The list of hacks the project has fallen victim to",
                type: "array",
                items: {
                  $ref: getSchemaPath(Hack),
                },
              },
              audits: {
                description: "The list of audits the project has had done",
                type: "array",
                items: {
                  $ref: getSchemaPath(Audit),
                },
              },
              chains: {
                description:
                  "The list of chains the project has been deployed on",
                type: "array",
                items: {
                  $ref: getSchemaPath(Chain),
                },
              },
              ecosystems: {
                description:
                  "The list of ecosystems the chains project is deployed on belong to",
                type: "array",
                items: {
                  type: "string",
                },
              },
              jobs: {
                description: "The list of jobs the project has",
                type: "array",
                items: {
                  $ref: getSchemaPath(StructuredJobpostWithRelations),
                },
              },
              repos: {
                description: "The list of repositories the project has",
                type: "array",
                items: {
                  $ref: getSchemaPath(Repository),
                },
              },
              investors: {
                description: "The list of investors the project has",
                type: "array",
                items: {
                  $ref: getSchemaPath(Investor),
                },
              },
              fundingRounds: {
                description: "The list of funding rounds the project has",
                type: "array",
                items: {
                  $ref: getSchemaPath(FundingRound),
                },
              },
              grants: {
                description: "The list of grants the project has received",
                type: "array",
                items: {
                  $ref: getSchemaPath(GrantFunding),
                },
              },
            },
          },
        },
      },
    ],
  },
  JobFilterConfigs: {
    type: "object",
    properties: {
      tvl: {
        $ref: getSchemaPath(RangeFilter),
      },
      salary: {
        $ref: getSchemaPath(RangeFilter),
      },
      headcountEstimate: {
        $ref: getSchemaPath(RangeFilter),
      },
      monthlyFees: {
        $ref: getSchemaPath(RangeFilter),
      },
      monthlyVolume: {
        $ref: getSchemaPath(RangeFilter),
      },
      monthlyRevenue: {
        $ref: getSchemaPath(RangeFilter),
      },
      audits: {
        $ref: getSchemaPath(MultiSelectFilter),
      },
      hacks: {
        $ref: getSchemaPath(MultiSelectFilter),
      },
      fundingRounds: {
        $ref: getSchemaPath(MultiSelectFilter),
      },
      investors: {
        $ref: getSchemaPath(MultiSelectFilter),
      },
      tags: {
        $ref: getSchemaPath(MultiSelectFilter),
      },
      onboardIntoWeb3: {
        $ref: getSchemaPath(SingleSelectFilter),
      },
      order: {
        $ref: getSchemaPath(SingleSelectFilter),
      },
      orderBy: {
        $ref: getSchemaPath(SingleSelectFilter),
      },
      publicationDate: {
        $ref: getSchemaPath(SingleSelectFilter),
      },
      locations: {
        $ref: getSchemaPath(MultiSelectFilter),
      },
      seniority: {
        $ref: getSchemaPath(MultiSelectFilter),
      },
      chains: {
        $ref: getSchemaPath(MultiSelectFilter),
      },
      projects: {
        $ref: getSchemaPath(MultiSelectFilter),
      },
      classifications: {
        $ref: getSchemaPath(MultiSelectFilter),
      },
      commitments: {
        $ref: getSchemaPath(MultiSelectFilter),
      },
      communities: {
        $ref: getSchemaPath(MultiSelectFilter),
      },
      ecosystems: {
        $ref: getSchemaPath(MultiSelectFilter),
      },
      organizations: {
        $ref: getSchemaPath(MultiSelectFilter),
      },
    },
  },
};
