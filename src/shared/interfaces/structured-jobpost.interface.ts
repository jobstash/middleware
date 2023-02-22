import { ApiProperty } from "@nestjs/swagger";

export class StructuredJobpost {
  @ApiProperty()
  id: string;
  @ApiProperty()
  min_salary: number;
  @ApiProperty()
  max_salary: number;
  @ApiProperty()
  role: string;
  @ApiProperty()
  team: string;
  @ApiProperty()
  benefits: string;
  @ApiProperty()
  interview: string;
  @ApiProperty()
  ai_generated_grammar_corrected_summary: string;
  @ApiProperty()
  ai_generated_team_description: string;
  @ApiProperty()
  ai_generated_education_free_skills: string;
  @ApiProperty()
  ai_generated_split_technologies_skills: string;
  @ApiProperty()
  ai_generated_hard_skills_string: string;
  @ApiProperty()
  job_apply_page_url: string;
  @ApiProperty()
  job_commitment: string;
  @ApiProperty()
  job_created_timestamp: string;
  @ApiProperty()
  job_found_timestamp: string;
  @ApiProperty()
  job_page_url: string;
  @ApiProperty()
  job_location: string;
  @ApiProperty()
  job_title: string;
  @ApiProperty()
  extracted_timestamp: string;
}
