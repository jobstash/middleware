export interface StructuredJobpost {
  id: string;
  salary: string;
  role: string;
  team: string;
  benefits: string;
  interview: string;

  aiGeneratedGrammarCorrectedSummary: string;
  aiGeneratedTeamDescription: string;
  aiGeneratedEducationFreeSkills: string;
  aiGeneratedSplitTechnologiesSkills: string;
  aiGeneratedHardSkillsString: string;

  jobApplyPageUrl: string;
  jobCommitment: string;
  jobCreatedTimestamp: string;
  jobFoundTimestamp: string;
  jobPageUrl: string;
  jobLocation: string;
  jobTitle: string;

  extractedTimestamp: string;
}
