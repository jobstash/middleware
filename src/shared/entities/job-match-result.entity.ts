import { ApiProperty } from "@nestjs/swagger";

export enum JobMatchCategory {
  STRONG_FIT = "strong_fit",
  PARTIAL_FIT = "partial_fit",
  UNLIKELY_FIT = "unlikely_fit",
}

export class JobMatchSkill {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  normalizedName: string;
}

export class JobMatchResult {
  @ApiProperty()
  score: number;

  @ApiProperty({ enum: JobMatchCategory })
  category: JobMatchCategory;

  @ApiProperty({ type: [JobMatchSkill] })
  matchedSkills: JobMatchSkill[];

  @ApiProperty({ type: [JobMatchSkill] })
  recommendedSkills: JobMatchSkill[];
}
