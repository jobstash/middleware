import { Injectable, OnModuleInit } from "@nestjs/common";
import { Neogma, NeogmaModel } from "neogma";
import { InjectConnection } from "nest-neogma";
import {
  AuditProps,
  AuditorProps,
  Auditors,
  Audits,
  ChainProps,
  Chains,
  DiscordProps,
  Discords,
  DocsiteProps,
  Docsites,
  FundingRoundProps,
  FundingRoundRelations,
  FundingRounds,
  GithubOrganizationProps,
  GithubOrganizations,
  GithubProps,
  Githubs,
  HackProps,
  Hacks,
  InvestorProps,
  Investors,
  JobpostClassificationProps,
  JobpostClassifications,
  JobpostCommitmentProps,
  JobpostCommitments,
  JobpostLocationTypeProps,
  JobpostLocationTypes,
  JobpostOfflineStatusProps,
  JobpostOfflineStatuses,
  JobpostOnlineStatusProps,
  JobpostOnlineStatuses,
  JobpostProps,
  JobpostRelations,
  Jobposts,
  JobsiteMethods,
  JobsiteProps,
  JobsiteRelations,
  Jobsites,
  OrganizationAliasProps,
  OrganizationAliases,
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
  Repositories,
  RepositoryProps,
  StructuredJobposStatics,
  StructuredJobpostMethods,
  StructuredJobpostProps,
  StructuredJobpostRelations,
  StructuredJobposts,
  TagMethods,
  TagProps,
  TagStatics,
  Tags,
  TelegramProps,
  Telegrams,
  TwitterProps,
  Twitters,
  UserEmailProps,
  UserEmails,
  UserProps,
  UserRelations,
  UserShowcaseProps,
  UserShowcases,
  Users,
  WebsiteProps,
  Websites,
  GithubUserProps,
  GithubUsers,
  UserContactProps,
  UserContacts,
  BlockedDesignationProps,
  DefaultDesignationProps,
  PairedDesignationProps,
  PreferredDesignationProps,
  BlockedDesignations,
  DefaultDesignations,
  PairedDesignations,
  PreferredDesignations,
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
  public OrganizationAliases: NeogmaModel<OrganizationAliasProps, NoRelations>;
  public GithubOrganizations: NeogmaModel<GithubOrganizationProps, NoRelations>;
  public GithubUsers: NeogmaModel<GithubUserProps, NoRelations>;
  public Projects: NeogmaModel<
    ProjectProps,
    ProjectRelations,
    ProjectMethods,
    ProjectStatics
  >;
  public Tags: NeogmaModel<TagProps, NoRelations, TagMethods, TagStatics>;
  public ProjectCategories: NeogmaModel<ProjectCategoryProps, NoRelations>;
  public BlockedDesignation: NeogmaModel<BlockedDesignationProps, NoRelations>;
  public PreferredDesignation: NeogmaModel<
    PreferredDesignationProps,
    NoRelations
  >;
  public PairedDesignation: NeogmaModel<PairedDesignationProps, NoRelations>;
  public DefaultDesignation: NeogmaModel<DefaultDesignationProps, NoRelations>;
  public JobpostOnlineStatuses: NeogmaModel<
    JobpostOnlineStatusProps,
    NoRelations
  >;
  public JobpostOfflineStatuses: NeogmaModel<
    JobpostOfflineStatusProps,
    NoRelations
  >;
  public JobpostClassifications: NeogmaModel<
    JobpostClassificationProps,
    NoRelations
  >;
  public JobpostCommitments: NeogmaModel<JobpostCommitmentProps, NoRelations>;
  public JobpostLocationTypes: NeogmaModel<
    JobpostLocationTypeProps,
    NoRelations
  >;
  public FundingRounds: NeogmaModel<FundingRoundProps, FundingRoundRelations>;
  public Investors: NeogmaModel<InvestorProps, NoRelations>;
  public Audits: NeogmaModel<AuditProps, NoRelations>;
  public Auditors: NeogmaModel<AuditorProps, NoRelations>;
  public Hacks: NeogmaModel<HackProps, NoRelations>;
  public Chains: NeogmaModel<ChainProps, NoRelations>;
  public Discords: NeogmaModel<DiscordProps, NoRelations>;
  public Repositories: NeogmaModel<RepositoryProps, NoRelations>;
  public Telegrams: NeogmaModel<TelegramProps, NoRelations>;
  public Githubs: NeogmaModel<GithubProps, NoRelations>;
  public Twitters: NeogmaModel<TwitterProps, NoRelations>;
  public Docsites: NeogmaModel<DocsiteProps, NoRelations>;
  public Websites: NeogmaModel<WebsiteProps, NoRelations>;
  public Users: NeogmaModel<UserProps, UserRelations>;
  public UserEmails: NeogmaModel<UserEmailProps, NoRelations>;
  public UserContacts: NeogmaModel<UserContactProps, NoRelations>;
  public UserShowcases: NeogmaModel<UserShowcaseProps, NoRelations>;

  onModuleInit = async (): Promise<void> => {
    // try {
    //   this.logger.log("Connection Initiated");
    //   await this.neogma.verifyConnectivity();
    //   this.logger.log("Connection Successfully");
    // } catch (e) {
    //   this.logger.error(e);
    // }
    this.StructuredJobposts = StructuredJobposts(this.neogma);
    this.Jobposts = Jobposts(this.neogma);
    this.Jobsites = Jobsites(this.neogma);
    this.Organizations = Organizations(this.neogma);
    this.Projects = Projects(this.neogma);
    this.Tags = Tags(this.neogma);
    this.ProjectCategories = ProjectCategories(this.neogma);
    this.BlockedDesignation = BlockedDesignations(this.neogma);
    this.PreferredDesignation = PreferredDesignations(this.neogma);
    this.PairedDesignation = PairedDesignations(this.neogma);
    this.DefaultDesignation = DefaultDesignations(this.neogma);
    this.JobpostOnlineStatuses = JobpostOnlineStatuses(this.neogma);
    this.JobpostOfflineStatuses = JobpostOfflineStatuses(this.neogma);
    this.FundingRounds = FundingRounds(this.neogma);
    this.Investors = Investors(this.neogma);
    this.Audits = Audits(this.neogma);
    this.Hacks = Hacks(this.neogma);
    this.Chains = Chains(this.neogma);
    this.OrganizationAliases = OrganizationAliases(this.neogma);
    this.GithubOrganizations = GithubOrganizations(this.neogma);
    this.GithubUsers = GithubUsers(this.neogma);
    this.JobpostClassifications = JobpostClassifications(this.neogma);
    this.JobpostCommitments = JobpostCommitments(this.neogma);
    this.JobpostLocationTypes = JobpostLocationTypes(this.neogma);
    this.Auditors = Auditors(this.neogma);
    this.Discords = Discords(this.neogma);
    this.Repositories = Repositories(this.neogma);
    this.Telegrams = Telegrams(this.neogma);
    this.Twitters = Twitters(this.neogma);
    this.Docsites = Docsites(this.neogma);
    this.Githubs = Githubs(this.neogma);
    this.Websites = Websites(this.neogma);
    this.Users = Users(this.neogma);
    this.UserEmails = UserEmails(this.neogma);
    this.UserContacts = UserContacts(this.neogma);
    this.UserShowcases = UserShowcases(this.neogma);
  };
}
