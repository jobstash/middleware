import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { UserShowCase } from "./user-showcase.interface";
import { UserSkill } from "./user-skill.interface";
import { UserWorkHistory } from "./user-work-history.interface";

/**
 * Fields available to an entitled Agency workspace or a superuser for a user
 * who opted in to availability. Only one verified contact email is exposed;
 * linked accounts, linked wallets, notes, and application history stay private.
 */
export class TalentPoolCandidate {
  @ApiProperty({ description: "The opted-in user's public primary wallet." })
  wallet: string;

  @ApiPropertyOptional({ nullable: true })
  name: string | null;

  @ApiPropertyOptional({ nullable: true })
  githubAvatar: string | null;

  @ApiPropertyOptional({ nullable: true })
  github: string | null;

  @ApiPropertyOptional({ nullable: true })
  email: string | null;

  @ApiProperty({
    type: "object",
    properties: {
      city: { type: "string", nullable: true },
      country: { type: "string", nullable: true },
    },
  })
  location: { city: string | null; country: string | null };

  @ApiProperty()
  availableForWork: true;

  @ApiProperty()
  cryptoNative: boolean;

  @ApiProperty()
  cryptoAdjacent: boolean;

  @ApiProperty({ type: [UserSkill] })
  skills: UserSkill[];

  @ApiProperty({ type: [UserShowCase] })
  showcases: UserShowCase[];

  @ApiProperty({ type: [UserWorkHistory] })
  workHistory: UserWorkHistory[];

  @ApiPropertyOptional({
    nullable: true,
    description: "Latest application or job-detail view timestamp.",
  })
  lastActivityTimestamp: number | null;
}

export class AgencyCandidateReportSummary {
  @ApiProperty()
  organizationCount: number;

  @ApiProperty()
  repositoryCount: number;

  @ApiProperty()
  totalCommits: number;

  @ApiProperty()
  totalStars: number;

  @ApiPropertyOptional({ nullable: true })
  averageTenure: number | null;

  @ApiPropertyOptional({ nullable: true })
  firstContributedAt: number | null;

  @ApiPropertyOptional({ nullable: true })
  lastContributedAt: number | null;
}

export class AgencyCandidateReport {
  @ApiProperty({ type: () => TalentPoolCandidate })
  candidate: TalentPoolCandidate;

  @ApiProperty({ type: () => AgencyCandidateReportSummary })
  summary: AgencyCandidateReportSummary;

  @ApiProperty({ type: [UserWorkHistory] })
  topOrganizations: UserWorkHistory[];

  @ApiProperty({ type: [UserWorkHistory] })
  workHistory: UserWorkHistory[];
}

export class TalentPoolData {
  @ApiProperty({ type: [TalentPoolCandidate] })
  candidates: TalentPoolCandidate[];
}
