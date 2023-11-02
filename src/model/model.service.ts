import { Injectable, OnModuleInit } from "@nestjs/common";
import { Neogma, NeogmaModel } from "neogma";
import { InjectConnection } from "nest-neogma";
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
  JobpostProps,
  JobpostRelations,
  Jobposts,
  JobsiteMethods,
  JobsiteProps,
  JobsiteRelations,
  Jobsites,
  OrganizationMethods,
  OrganizationProps,
  OrganizationRelations,
  Organizations,
  ProjectCategories,
  ProjectCategoryProps,
  ProjectMethods,
  ProjectProps,
  ProjectRelations,
  ProjectStatics,
  Projects,
  StructuredJobposStatics,
  StructuredJobpostMethods,
  StructuredJobpostProps,
  StructuredJobpostRelations,
  StructuredJobposts,
  Tags,
  TagMethods,
  TagProps,
  TagStatics,
  JobpostOnlineStatusProps,
  JobpostOfflineStatusProps,
  JobpostOnlineStatuses,
  JobpostOfflineStatuses,
} from "src/shared/models";
import { NoRelations } from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";

@Injectable()
export class ModelService implements OnModuleInit {
  private readonly logger = new CustomLogger(ModelService.name);
  constructor(
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
  public Projects: NeogmaModel<
    ProjectProps,
    ProjectRelations,
    ProjectMethods,
    ProjectStatics
  >;
  public Tags: NeogmaModel<TagProps, NoRelations, TagMethods, TagStatics>;
  public ProjectCategories: NeogmaModel<ProjectCategoryProps, NoRelations>;
  public JobpostOnlineStatuses: NeogmaModel<
    JobpostOnlineStatusProps,
    NoRelations
  >;
  public JobpostOfflineStatuses: NeogmaModel<
    JobpostOfflineStatusProps,
    NoRelations
  >;
  public FundingRounds: NeogmaModel<FundingRoundProps, FundingRoundRelations>;
  public Investors: NeogmaModel<InvestorProps, NoRelations>;
  public Audits: NeogmaModel<AuditProps, NoRelations>;
  public Hacks: NeogmaModel<HackProps, NoRelations>;
  public Chains: NeogmaModel<ChainProps, NoRelations>;

  onModuleInit = async (): Promise<void> => {
    try {
      this.logger.log("Connection Initiated");
      await this.neogma.verifyConnectivity();
      this.logger.log("Connection Successfully");
    } catch (e) {
      this.logger.error(e);
    }
    this.StructuredJobposts = StructuredJobposts(this.neogma);
    this.Jobposts = Jobposts(this.neogma);
    this.Jobsites = Jobsites(this.neogma);
    this.Organizations = Organizations(this.neogma);
    this.Projects = Projects(this.neogma);
    this.Tags = Tags(this.neogma);
    this.ProjectCategories = ProjectCategories(this.neogma);
    this.JobpostOnlineStatuses = JobpostOnlineStatuses(this.neogma);
    this.JobpostOfflineStatuses = JobpostOfflineStatuses(this.neogma);
    this.FundingRounds = FundingRounds(this.neogma);
    this.Investors = Investors(this.neogma);
    this.Audits = Audits(this.neogma);
    this.Hacks = Hacks(this.neogma);
    this.Chains = Chains(this.neogma);
  };
}
