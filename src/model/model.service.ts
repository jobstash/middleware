import { Injectable, OnModuleInit } from "@nestjs/common";
import { Neogma, NeogmaModel } from "neogma";
import { InjectConnection } from "nest-neogma";
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
} from "src/shared/models";
import { CustomLogger } from "src/shared/utils/custom-logger";

@Injectable()
export class ModelService implements OnModuleInit {
  logger = new CustomLogger(ModelService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
  ) {}

  public StructuredJobposts: NeogmaModel<
    StructuredJobpostProps,
    StructuredJobpostRelations
  >;
  public Jobposts: NeogmaModel<JobpostProps, JobpostRelations>;
  public Jobsites: NeogmaModel<JobsiteProps, JobsiteRelations>;
  public Organizations: NeogmaModel<OrganizationProps, OrganizationRelations>;
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
}
