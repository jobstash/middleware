import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { Cache } from "cache-manager";
import { Neogma, NeogmaModel } from "neogma";
import { InjectConnection } from "nest-neogma";
import {
  ALL_JOBS_CACHE_KEY,
  ALL_JOBS_FILTER_CONFIGS_CACHE_KEY,
  JOBS_LIST_CACHE_KEY,
  JOBS_LIST_FILTER_CONFIGS_CACHE_KEY,
  PUBLIC_JOBS_LIST_CACHE_KEY,
} from "src/shared/constants";
import {
  AuditProps,
  Audits,
  ChainProps,
  Chains,
  FundingRoundProps,
  FundingRoundRelations,
  FundingRounds,
  HackProps,
  Hacks,
  InvestorProps,
  Investors,
  JobpostCategories,
  JobpostCategoryProps,
  JobpostProps,
  JobpostRelations,
  JobpostStatusProps,
  JobpostStatuses,
  Jobposts,
  JobsiteMethods,
  JobsiteProps,
  JobsiteRelations,
  Jobsites,
  OrganizationMethods,
  OrganizationProps,
  OrganizationRelations,
  Organizations,
  ProjectProps,
  Projects,
  StructuredJobposStatics,
  StructuredJobpostMethods,
  StructuredJobpostProps,
  StructuredJobpostRelations,
  StructuredJobposts,
  TechnolgyBlockedTermProps,
  TechnolgyBlockedTerms,
  Technologies,
  TechnologyMethods,
  TechnologyProps,
  TechnologyRelations,
  TechnologyStatics,
} from "src/shared/models";
import { NoRelations } from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";

@Injectable()
export class ModelService implements OnModuleInit {
  logger = new CustomLogger(ModelService.name);
  constructor(
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
    @InjectConnection()
    private neogma: Neogma,
  ) {}

  public StructuredJobposts: NeogmaModel<
    StructuredJobpostProps,
    StructuredJobpostRelations,
    StructuredJobpostMethods,
    StructuredJobposStatics
  >;
  public Jobposts: NeogmaModel<JobpostProps, JobpostRelations>;
  public Jobsites: NeogmaModel<JobsiteProps, JobsiteRelations, JobsiteMethods>;
  public Organizations: NeogmaModel<
    OrganizationProps,
    OrganizationRelations,
    OrganizationMethods
  >;
  public Projects: NeogmaModel<ProjectProps, NoRelations>;
  public Technologies: NeogmaModel<
    TechnologyProps,
    TechnologyRelations,
    TechnologyMethods,
    TechnologyStatics
  >;
  public JobpostCategories: NeogmaModel<JobpostCategoryProps, NoRelations>;
  public JobpostStatuses: NeogmaModel<JobpostStatusProps, NoRelations>;
  public FundingRounds: NeogmaModel<FundingRoundProps, FundingRoundRelations>;
  public Investors: NeogmaModel<InvestorProps, NoRelations>;
  public TechnologyBlockedTerms: NeogmaModel<
    TechnolgyBlockedTermProps,
    NoRelations
  >;
  public Audits: NeogmaModel<AuditProps, NoRelations>;
  public Hacks: NeogmaModel<HackProps, NoRelations>;
  public Chains: NeogmaModel<ChainProps, NoRelations>;

  onModuleInit = async (): Promise<void> => {
    try {
      await this.neogma.verifyConnectivity();
    } catch (e) {
      this.logger.error(e);
    }
    this.StructuredJobposts = StructuredJobposts(this.neogma);
    this.Jobposts = Jobposts(this.neogma);
    this.Jobsites = Jobsites(this.neogma);
    this.Organizations = Organizations(this.neogma);
    this.Projects = Projects(this.neogma);
    this.Technologies = Technologies(this.neogma);
    this.JobpostCategories = JobpostCategories(this.neogma);
    this.JobpostStatuses = JobpostStatuses(this.neogma);
    this.FundingRounds = FundingRounds(this.neogma);
    this.Investors = Investors(this.neogma);
    this.TechnologyBlockedTerms = TechnolgyBlockedTerms(this.neogma);
    this.Audits = Audits(this.neogma);
    this.Hacks = Hacks(this.neogma);
    this.Chains = Chains(this.neogma);
  };

  validateCache = async (): Promise<void> => {
    try {
      const res = await this.neogma.queryRunner.run(
        `
          MATCH (node: DirtyNode)
          WITH node.dirty as isDirty, node
          SET (CASE WHEN isDirty = true THEN node END).dirty = false 
          RETURN isDirty
      `.replace(/^\s*$(?:\r\n?|\n)/gm, ""),
      );
      const isDirty = (res.records[0]?.get("isDirty") as boolean) ?? false;
      if (isDirty) {
        await this.cacheManager.del(JOBS_LIST_CACHE_KEY);
        await this.cacheManager.del(PUBLIC_JOBS_LIST_CACHE_KEY);
        await this.cacheManager.del(JOBS_LIST_FILTER_CONFIGS_CACHE_KEY);
        await this.cacheManager.del(ALL_JOBS_CACHE_KEY);
        await this.cacheManager.del(ALL_JOBS_FILTER_CONFIGS_CACHE_KEY);
      }
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "models.service",
        });
        Sentry.captureException(error);
      });
      this.logger.error(`ModelService::shouldClearCache ${error.message}`);
    }
  };
}
