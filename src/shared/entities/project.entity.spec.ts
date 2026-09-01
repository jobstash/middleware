import { ProjectWithBaseRelationsEntity } from "./project.entity";

describe("ProjectWithBaseRelationsEntity", () => {
  it("normalizes absent legacy relation arrays", () => {
    const project = new ProjectWithBaseRelationsEntity({
      id: "project-1",
      name: "Legacy project",
      normalizedName: "legacy-project",
      orgIds: [],
      logo: null,
      tokenSymbol: null,
      tvl: null,
      monthlyFees: null,
      monthlyVolume: null,
      monthlyRevenue: null,
      monthlyActiveUsers: null,
      summary: "",
      description: null,
      defiLlamaId: null,
      defiLlamaSlug: null,
      defiLlamaParent: null,
      tokenAddress: null,
      createdTimestamp: null,
      updatedTimestamp: null,
      github: null,
      website: null,
      docs: null,
      category: null,
      twitter: null,
      discord: null,
      telegram: null,
    } as never).getProperties();

    expect(project).toMatchObject({
      hacks: [],
      audits: [],
      chains: [],
      ecosystems: [],
      jobs: [],
      repos: [],
      grants: [],
      fundingRounds: [],
      investors: [],
    });
  });
});
