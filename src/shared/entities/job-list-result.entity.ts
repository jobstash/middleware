import {
  JobListResult,
  Organization,
  Project,
  ProjectCategory,
  StructuredJobpost,
  Technology,
} from "src/shared/types";

type RawJobPost = {
  organization?: Organization | null;
  project?: Project | null;
  jobpost?: StructuredJobpost | null;
  technologies?: [object & { properties: Technology }] | null;
  categories?: [object & { properties: ProjectCategory }] | null;
};

export class JobListResultEntity {
  constructor(private readonly raw: RawJobPost) {}

  getProperties(): JobListResult {
    // eslint-disable-next-line
    const { organization, project, jobpost, technologies, categories } =
      this.raw;
    return {
      organization: {
        id: organization["id"],
        org_id: organization["orgId"],
        name: organization["name"],
        description: organization["description"],
        location: organization["location"],
        url: organization["url"],
        github_organization: organization["githubOrganization"],
        team_size: organization["teamSize"],
        twitter: organization["twitter"],
        discord: organization["discord"],
        linkedin: organization["linkedin"],
        telegram: organization["telegram"],
        created_timestamp: organization["createdTimestamp"],
        updated_timestamp: organization["updatedTimestamp"],
      },
      project: {
        id: project["id"],
        defillama_id: project["defillamaId"],
        defillama_slug: project["defillamaSlug"],
        name: project["name"],
        description: project["description"],
        url: project["url"],
        logo: project["logo"],
        token_address: project["tokenAddress"],
        token_symbol: project["tokenSymbol"],
        is_in_construction: project["isInConstruction"],
        tvl: project["tvl"],
        monthly_volume: project["monthlyVolume"],
        monthly_active_users: project["monthlyActiveUsers"],
        monthly_revenue: project["monthlyRevenue"],
        created_timestamp: project["createdTimestamp"],
        updated_timestamp: project["updatedTimestamp"],
      },
      jobpost: {
        id: jobpost["id"],
        min_salary: jobpost["minSalary"],
        max_salary: jobpost["maxSalary"],
        role: jobpost["role"],
        team: jobpost["team"],
        benefits: jobpost["benefits"],
        interview: jobpost["interview"],
        ai_generated_grammar_corrected_summary:
          jobpost["aiGeneratedGrammarCorrectedSummary"],
        ai_generated_team_description: jobpost["aiGeneratedTeamDescription"],
        ai_generated_education_free_skills:
          jobpost["aiGeneratedEducationFreeSkills"],
        ai_generated_split_technologies_skills:
          jobpost["aiGeneratedSplitTechnologiesSkills"],
        ai_generated_hard_skills_string: jobpost["aiGeneratedHardSkillsString"],
        job_apply_page_url: jobpost["jobApplyPageUrl"],
        job_commitment: jobpost["jobCommitment"],
        job_created_timestamp: jobpost["jobCreatedTimestamp"],
        job_found_timestamp: jobpost["jobFoundTimestamp"],
        job_page_url: jobpost["jobPageUrl"],
        job_location: jobpost["jobLocation"],
        job_title: jobpost["jobTitle"],
        extracted_timestamp: jobpost["extractedTimestamp"],
      },
      technologies: technologies?.map(technology => technology.properties),
      categories: categories?.map(category => category.properties),
    } as JobListResult;
  }
}
