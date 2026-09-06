import { Type } from "class-transformer";
import { PartialType } from "@nestjs/mapped-types";
import { UpdateJobPreferencesInput } from "./update-job-preferences.input";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  ValidateNested,
} from "class-validator";

class ResumePreferencesInput extends PartialType(UpdateJobPreferencesInput) {}
class ResumeLocationInput {
  @IsOptional() @IsString() @MaxLength(160) city?: string | null;
  @IsOptional() @IsString() @MaxLength(160) country?: string | null;
  @IsOptional() @Matches(/^[A-Z]{2}$/) countryCode?: string | null;
}
class ResumeProfileInput {
  @IsOptional() @IsString() @MaxLength(160) name?: string | null;
  @IsOptional()
  @ValidateNested()
  @Type(() => ResumeLocationInput)
  location?: ResumeLocationInput | null;
}

class CareerRoleInput {
  @IsString() @MaxLength(160) title: string;
  @IsString() @MaxLength(160) company: string;
  @IsString() @MaxLength(2000) description: string;
  @IsOptional() @IsDateString({ strict: true }) startDate: string | null;
  @IsOptional() @IsDateString({ strict: true }) endDate: string | null;
  @IsBoolean() current: boolean;
  @IsOptional()
  @IsIn(["intern", "junior", "mid", "senior", "lead", "principal", "executive"])
  seniority: string | null;
}

/** User-confirmed CV fields, never a raw resume or contact details. */
export class RecommendationCareerInput {
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => CareerRoleInput)
  roles: CareerRoleInput[];
  @IsOptional()
  @IsIn(["secondary", "associate", "bachelor", "master", "doctorate", "other"])
  educationLevel: string | null;
  @IsOptional()
  @ValidateNested()
  @Type(() => ResumeProfileInput)
  profile?: ResumeProfileInput;
  @IsOptional()
  @ValidateNested()
  @Type(() => ResumePreferencesInput)
  preferences?: ResumePreferencesInput;
}
