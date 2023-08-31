import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { Cache } from "cache-manager";
import { Neogma, NeogmaModel } from "neogma";
import { InjectConnection } from "nest-neogma";
import * as Sentry from "@sentry/node";
import {
  StructuredJobposts,
  StructuredJobpostProps,
  JobpostProps,
  StructuredJobpostRelations,
  JobpostRelations,
  JobsiteProps,
  JobsiteRelations,
  OrganizationProps,
  OrganizationRelations,
  TechnologyProps,
  Jobposts,
  Jobsites,
  Organizations,
  Technologies,
  ProjectProps,
  Projects,
  JobpostCategoryProps,
  JobpostCategories,
  JobpostStatuses,
  JobpostStatusProps,
  InvestorProps,
  FundingRoundProps,
  FundingRoundRelations,
  FundingRounds,
  Investors,
  TechnolgyBlockedTermProps,
  TechnolgyBlockedTerms,
  AuditProps,
  HackProps,
  ChainProps,
  Audits,
  Hacks,
  Chains,
  StructuredJobpostMethods,
  JobsiteMethods,
  OrganizationMethods,
  StructuredJobposStatics,
} from "src/shared/models";
import {
  ALL_JOBS_CACHE_KEY,
  ALL_JOBS_FILTER_CONFIGS_CACHE_KEY,
  JOBS_LIST_CACHE_KEY,
  JOBS_LIST_FILTER_CONFIGS_CACHE_KEY,
  PUBLIC_JOBS_LIST_CACHE_KEY,
} from "src/shared/constants";
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
  public Projects: NeogmaModel<ProjectProps, object>;
  public Technologies: NeogmaModel<TechnologyProps, object>;
  public JobpostCategories: NeogmaModel<JobpostCategoryProps, object>;
  public JobpostStatuses: NeogmaModel<JobpostStatusProps, object>;
  public FundingRounds: NeogmaModel<FundingRoundProps, FundingRoundRelations>;
  public Investors: NeogmaModel<InvestorProps, object>;
  public TechnologyBlockedTerms: NeogmaModel<TechnolgyBlockedTermProps, object>;
  public Audits: NeogmaModel<AuditProps, object>;
  public Hacks: NeogmaModel<HackProps, object>;
  public Chains: NeogmaModel<ChainProps, object>;

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
