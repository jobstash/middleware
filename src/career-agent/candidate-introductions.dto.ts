import { IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from "class-validator";
import { MutationInput } from "./career.dto";

export class IntroductionSaveInput extends MutationInput {
  @IsOptional() @IsUUID() id?: string;
  @IsString() @MinLength(1) @MaxLength(200) organizationId: string;
  @IsString() @MinLength(1) @MaxLength(256) suggestionId: string;
  @IsOptional() @IsUUID() applicationId?: string;
  @IsString() @Matches(/\S/) @MaxLength(8000) text: string;
}

export class IntroductionListInput {
  @IsOptional() @IsInt() @Min(0) @Max(100000) offset?: number;
  @IsOptional() @IsInt() @Min(1) @Max(50) limit?: number;
}
