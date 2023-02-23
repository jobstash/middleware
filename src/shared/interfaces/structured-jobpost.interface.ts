import { ApiProperty } from "@nestjs/swagger";

export class StructuredJobpost {
  @ApiProperty()
  id: string;
  @ApiProperty()
  minSalary: number;
  @ApiProperty()
  maxSalary: number;
  @ApiProperty()
  role: string;
  @ApiProperty()
  team: string;
  @ApiProperty()
  benefits: string;
  @ApiProperty()
  interview: string;
  @ApiProperty()
  aiGeneratedGrammarCorrectedSummary: string;
  @ApiProperty()
  aiGeneratedTeamDescription: string;
  @ApiProperty()
  aiGeneratedEducationFreeSkills: string;
  @ApiProperty()
  aiGeneratedSplitTechnologiesSkills: string;
  @ApiProperty()
  aiGeneratedHardSkillsString: string;
  @ApiProperty()
  jobApplyPageUrl: string;
  @ApiProperty()
  jobCommitment: string;
  @ApiProperty()
  jobCreatedTimestamp: string;
  @ApiProperty()
  jobFoundTimestamp: string;
  @ApiProperty()
  jobPageUrl: string;
  @ApiProperty()
  jobLocation: string;
  @ApiProperty()
  jobTitle: string;
  @ApiProperty()
  extractedTimestamp: string;
}
