import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { UserShowCase } from "./user-showcase.interface";
import { UserSkill } from "./user-skill.interface";
import { UserWorkHistory } from "./user-work-history.interface";

/**
 * Explicitly public fields from a user who opted in to availability. Email,
 * linked-account, linked-wallet, note, and application-history fields are not
 * part of this contract.
 */
export class SignalCandidate {
  @ApiProperty({ description: "The opted-in user's public primary wallet." })
  wallet: string;

  @ApiPropertyOptional({ nullable: true })
  name: string | null;

  @ApiPropertyOptional({ nullable: true })
  githubAvatar: string | null;

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
}

export class SignalClassificationInterest {
  @ApiProperty()
  classification: string;

  @ApiProperty({ minimum: 5 })
  interestedCandidates: number;
}

export class SignalTagInterest {
  @ApiProperty()
  tag: string;

  @ApiProperty({ minimum: 5 })
  interestedCandidates: number;
}

export class SignalsAggregateInterests {
  @ApiProperty({ enum: [5] })
  minimumAggregateSize: 5;

  @ApiProperty({ type: [SignalClassificationInterest] })
  jobClassifications: SignalClassificationInterest[];

  @ApiProperty({ type: [SignalTagInterest] })
  tags: SignalTagInterest[];
}

export class SignalsData {
  @ApiProperty({ type: [SignalCandidate] })
  candidates: SignalCandidate[];

  @ApiProperty({ type: () => SignalsAggregateInterests })
  aggregateInterests: SignalsAggregateInterests;
}
