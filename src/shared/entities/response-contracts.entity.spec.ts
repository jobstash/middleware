import { Tag, TagPreference, WorkArrangementV1, hydrateWorkArrangement } from "../interfaces";
import { doubleZeroEdgeProjection } from "../../projects/fixtures/doublezero-edge.fixture";
import { AllJobListResultEntity, AllOrgJobsListResultEntity } from "./all-jobs-list-result.entity";
import { JobDetailsEntity } from "./job-details.entity";
import { ProjectWithBaseRelationsEntity, ProjectWithRelationsEntity } from "./project.entity";
import { TagEntity } from "./tag.entity";
import { JobListResultEntity, EcosystemJobListResultEntity } from "./job-list-result.entity";
import { OrgDetailsResultEntity, OrgListResultEntity } from "./org-details-result.entity";
import { ProjectDetailsEntity } from "./project-details.entity";
import { ProjectCompetitorListResultEntity, ProjectListResultEntity } from "./project-list-result.entity";
import { StructuredJobpostWithRelationsEntity } from "./structured-jobpost-with-relations.entity";

const project = {
  id: "project-id",
  name: "Project",
  normalizedName: "project",
  orgIds: ["org-id"],
  summary: "Project summary",
  description: "Project description",
  website: null,
  logo: null,
  category: null,
  tokenSymbol: null,
  tvl: null,
  monthlyFees: null,
  monthlyVolume: null,
  monthlyRevenue: null,
  monthlyActiveUsers: null,
  hacks: [],
  audits: [],
  chains: [],
  ecosystems: [],
  repos: [],
  jobs: [],
  investors: [],
  grants: [],
  fundingRounds: [],
  tags: [],
};

const organization = {
  id: "organization-id",
  orgId: "org-id",
  name: "Organization",
  normalizedName: "organization",
  summary: "Organization summary",
  description: "Organization description",
  location: "",
  website: null,
  aliases: [],
  reviews: [],
  projects: [],
  investors: [],
  grants: [],
  fundingRounds: [],
  ecosystems: [],
  tags: [],
  jobs: [],
  hasUser: false,
  atsClient: null,
};

const job = {
  id: "job-id",
  shortUUID: "short-id",
  access: "public",
  url: "https://example.com/job",
  title: "Engineer",
  salary: null,
  culture: null,
  location: "Office",
  summary: "Summary",
  benefits: [],
  seniority: null,
  description: "Description",
  requirements: [],
  paysInCrypto: false,
  minimumSalary: null,
  maximumSalary: null,
  salaryCurrency: null,
  onboardIntoWeb3: false,
  ethSeasonOfInternships: false,
  responsibilities: [],
  featured: false,
  featureStartDate: null,
  featureEndDate: null,
  timestamp: 100,
  offersTokenAllocation: false,
  classification: "ENGINEERING",
  commitment: "FULL_TIME",
  locationType: "ONSITE",
  tags: [],
};

const storedOption = {
  scope: "country_list",
  includedCountries: ["NL"],
  excludedCountries: [],
  includedRegions: [],
  excludedRegions: [],
  requiredUtcBand: null,
  preferredUtcBand: null,
  residencyRequirements: [],
  workAuthorizationRequirements: [],
  sponsorshipStatus: "unstated",
  officeCity: "Amsterdam",
  attendanceCadence: "Five days weekly",
  travelRequirement: null,
  confidence: "source_stated",
};

const storedArrangement = {
  classification: "verified_onsite",
  fullyRemote: false,
  remoteOptions: [],
  hybridOptions: [],
  onsiteOptions: [storedOption],
};

describe("Sentry response contract regressions", () => {
  it.each([JobListResultEntity, EcosystemJobListResultEntity])(
    "MIDDLEWARE-27T: %p retains projects without optional source text",
    Entity => {
      const { summary: _summary, description: _description, ...sparseProject } = project;
      const result = new Entity({
        ...job,
        organization: { ...organization, projects: [sparseProject, project] },
        project: null,
      } as never).getProperties();
      expect(result.organization.projects).toHaveLength(2);
      expect(result.organization.projects[0]).toMatchObject({ id: "project-id", summary: "", description: null });
      expect(result.organization.projects[1]).toMatchObject({ summary: project.summary, description: project.description });
    },
  );

  it.each([OrgListResultEntity, OrgDetailsResultEntity])(
    "MIDDLEWARE-286: %p preserves empty and supplied organization locations",
    Entity => {
      for (const location of ["", null, "Amsterdam"]) {
        const result = new Entity({ ...organization, location } as never).getProperties();
        expect(result.location).toBe(location ?? "");
      }
      expect(() => new Entity({ ...organization, location: 123 } as never).getProperties()).toThrow(/location/);
    },
  );

  it("MIDDLEWARE-29B: hydrates nested organization tag timestamps without dropping tags", () => {
    const tags = [
      { id: "legacy-tag", name: "Legacy", normalizedName: "legacy" },
      { id: "dated-tag", name: "Dated", normalizedName: "dated", createdTimestamp: 123 },
    ];
    const result = new ProjectDetailsEntity({
      ...project,
      organizations: [{ ...organization, tags }],
    } as never).getProperties();
    expect(result.organizations[0].tags).toEqual([
      { ...tags[0], createdTimestamp: null },
      tags[1],
    ]);
  });

  it("hydrates the captured DoubleZero Edge projection without changing stored public data", () => {
    const raw = structuredClone(doubleZeroEdgeProjection);
    const result = new ProjectDetailsEntity(raw as never).getProperties();
    expect(result.id).toBe("19036459-bd3c-4fee-9397-83d949ced4ae");
    expect(result.organizations[0].tags).toEqual(raw.organizations[0].tags.map(tag => ({
      ...tag,
      createdTimestamp: "createdTimestamp" in tag ? tag.createdTimestamp : null,
    })));
    expect(result.jobs.map(job => job.id)).toEqual(raw.jobs.map(job => job.id));
    expect(raw).toEqual(doubleZeroEdgeProjection);
  });

  it.each([
    ProjectDetailsEntity,
    ProjectListResultEntity,
    ProjectCompetitorListResultEntity,
    ProjectWithBaseRelationsEntity,
    ProjectWithRelationsEntity,
  ])("%p preserves zero and rejects malformed nested job tag timestamps", Entity => {
    const tag = { id: "tag-id", name: "Tag", normalizedName: "tag" };
    const input = {
      ...doubleZeroEdgeProjection,
      jobs: [{ ...doubleZeroEdgeProjection.jobs[0], tags: [tag, { ...tag, createdTimestamp: 0 }] }],
    };
    const result = new Entity(input as never).getProperties();
    expect(result.jobs[0].tags).toEqual([
      { ...tag, createdTimestamp: null },
      { ...tag, createdTimestamp: 0 },
    ]);
    for (const createdTimestamp of ["invalid", "123", false, {}, NaN, Infinity]) {
      expect(() => new Entity({
        ...input,
        jobs: [{ ...input.jobs[0], tags: [{ ...tag, createdTimestamp }] }],
      } as never).getProperties()).toThrow(/createdTimestamp/);
    }
  });

  it.each([
    JobListResultEntity,
    EcosystemJobListResultEntity,
    JobDetailsEntity,
    AllJobListResultEntity,
    AllOrgJobsListResultEntity,
    OrgListResultEntity,
    OrgDetailsResultEntity,
    StructuredJobpostWithRelationsEntity,
  ])("%p uses the strict tag hydrator at its response boundary", Entity => {
    const tag = { id: "tag-id", name: "Tag", normalizedName: "tag" };
    const input = {
      ...organization,
      ...job,
      isBlocked: false,
      isOnline: true,
      organization,
      project: null,
      tags: [{ ...tag, createdTimestamp: 0 }],
    };
    expect(new Entity(input as never).getProperties().tags)
      .toEqual([{ ...tag, createdTimestamp: 0 }]);
    expect(() => new Entity({
      ...input,
      tags: [{ ...tag, createdTimestamp: "invalid" }],
    } as never).getProperties()).toThrow(/createdTimestamp/);
  });

  it("validates standalone tag entities instead of silently nulling invalid timestamps", () => {
    const tag = { id: "tag-id", name: "Tag", normalizedName: "tag" };
    expect(new TagEntity(tag as never).getProperties().createdTimestamp).toBeNull();
    expect(new TagEntity({ ...tag, createdTimestamp: 0 }).getProperties().createdTimestamp).toBe(0);
    expect(() => new TagEntity({ ...tag, createdTimestamp: "invalid" } as never).getProperties())
      .toThrow(/createdTimestamp/);
  });

  it("hydrates preferred tags and synonyms without bypassing strict timestamp validation", () => {
    const tag = { id: "tag-id", name: "Tag", normalizedName: "tag" };
    const raw = { tag, synonyms: [{ ...tag, createdTimestamp: 0 }] };
    const preference = new TagPreference(raw as never);
    expect(preference.tag.createdTimestamp).toBeNull();
    expect(preference.synonyms[0].createdTimestamp).toBe(0);
    expect(raw.tag).not.toHaveProperty("createdTimestamp");
    expect(() => new TagPreference({
      tag,
      synonyms: [{ ...tag, createdTimestamp: "invalid" }],
    } as never)).toThrow(/createdTimestamp/);
  });

  it("MIDDLEWARE-29S: represents an unknown tag timestamp as null, not invented time", () => {
    const tag = { id: "tag-id", name: "Tag", normalizedName: "tag" };
    expect(new Tag(tag).createdTimestamp).toBeNull();
    expect(new Tag({ ...tag, createdTimestamp: 0 }).createdTimestamp).toBe(0);
    expect(new Tag({ ...tag, createdTimestamp: 123 }).createdTimestamp).toBe(123);
    expect(() => new Tag({ ...tag, createdTimestamp: "invalid" } as never)).toThrow(/createdTimestamp/);
    expect(() => new Tag({ ...tag, name: 123 } as never)).toThrow(/name/);
    expect(Tag.TagType.is(tag)).toBe(false);
  });

  it.each([ProjectListResultEntity, ProjectDetailsEntity])(
    "MIDDLEWARE-29A: %p hydrates onsite option context before strict validation",
    Entity => {
      const result = new Entity({
        ...project,
        organizations: [],
        jobs: [{ ...job, workArrangement: storedArrangement }],
      } as never).getProperties();
      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].workArrangement.onsiteOptions).toEqual([
        { ...storedOption, classification: "verified_onsite", mode: "onsite" },
      ]);
      expect(storedOption).not.toHaveProperty("mode");
    },
  );

  it("inherits context for every mode without overwriting explicit option trust", () => {
    const result = hydrateWorkArrangement({
      ...storedArrangement,
      classification: "conflicting",
      remoteOptions: [{ ...storedOption, classification: "remote_unqualified", mode: "remote" }],
      hybridOptions: [storedOption],
    } as never);
    expect(result.remoteOptions[0].classification).toBe("remote_unqualified");
    expect(result.hybridOptions[0]).toMatchObject({ mode: "hybrid", classification: "conflicting" });
    expect(result.onsiteOptions[0]).toMatchObject({ mode: "onsite", classification: "conflicting" });
    expect(WorkArrangementV1.WorkArrangementV1Type.is(result)).toBe(true);
  });

  it("does not hide malformed work options behind contextual defaults", () => {
    const malformed = {
      ...storedArrangement,
      onsiteOptions: [{ ...storedOption, mode: "invalid", classification: "invalid" }],
    };
    expect(() => new ProjectListResultEntity({
      ...project,
      jobs: [{ ...job, workArrangement: malformed }],
    } as never).getProperties()).toThrow(/workArrangement/);
  });
});
