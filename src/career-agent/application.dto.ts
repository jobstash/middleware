import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
  ValidateIf,
} from "class-validator";
import { CvInput, MutationInput } from "./career.dto";
export class CvHeading {
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(200) contact?: string;
  @IsOptional() @IsString() @MaxLength(160) location?: string;
}
export class SaveCvInput extends CvInput {
  @IsUUID() sourceDocumentId: string;
  @IsOptional() @IsString() @MaxLength(160) direction?: string;
  @IsOptional() @ValidateNested() @Type(() => CvHeading) heading?: CvHeading;
  @IsOptional() @IsUUID() cvId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(2000)
  @ValidateNested({ each: true }) @Type(() => CvBaselineChange)
  baselineChanges?: CvBaselineChange[];
  @IsOptional() @IsArray() @ArrayMaxSize(2000)
  @IsString({ each: true }) @MaxLength(100, { each: true })
  baselineOrder?: string[];
}
export class PrepareInput extends MutationInput {
  @IsUUID() applicationId: string;
  @IsUUID() cvVersionId: string;
}
export class DraftChangeEdit {
  @IsUUID() evidenceId: string;
  @IsString() @MinLength(1) @MaxLength(4000) text: string;
  @IsOptional() @IsBoolean() excluded?: boolean;
}
export class DraftSectionEdit {
  @IsUUID() sectionId: string;
  @IsString() @MinLength(1) @MaxLength(6000) text: string;
  @IsOptional() @IsBoolean() excluded?: boolean;
}
export class CvBaselineChange {
  @IsString() @MinLength(1) @MaxLength(100) entryId: string;
  @IsString() @MinLength(1) @MaxLength(20000) text: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20)
  @IsUUID("all", { each: true }) evidenceIds?: string[];
}
export class EditDraftInput extends MutationInput {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => DraftChangeEdit)
  changes?: DraftChangeEdit[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => DraftSectionEdit)
  sections?: DraftSectionEdit[];
  @IsOptional() @IsArray() @ArrayMaxSize(2000)
  @ValidateNested({ each: true }) @Type(() => CvBaselineChange)
  baselineChanges?: CvBaselineChange[];
  @IsOptional() @IsArray() @ArrayMaxSize(2000)
  @IsString({ each: true }) @MaxLength(100, { each: true })
  baselineOrder?: string[];
}
export class ExportInput extends MutationInput {
  @IsIn(["cv", "letter", "answers"]) kind: "cv" | "letter" | "answers";
}
export class AnswerQuestionInput extends MutationInput {
  @ValidateIf((_object, value) => value !== null)
  @IsString() @MaxLength(6000) answer: string | null;
}
export class DirectionsInput extends MutationInput {
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  directions: string[];
}
export class WordingProposal {
  @IsUUID() evidenceId: string;
  @IsString() @MinLength(1) @MaxLength(4000) text: string;
}
export class DraftSectionInput {
  @IsOptional() @IsUUID() sectionId?: string;
  @IsIn(["letter", "answer"]) kind: "letter" | "answer";
  @IsOptional() @IsString() @MaxLength(2000) question?: string;
  @IsString() @MinLength(1) @MaxLength(6000) text: string;
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID("all", { each: true })
  evidenceIds: string[];
}
export class DraftQuestionInput {
  @IsString() @MinLength(1) @MaxLength(2000) question: string;
  @IsOptional() @IsIn(["situation", "task", "action", "result"])
  stage?: "situation" | "task" | "action" | "result";
}
export class DraftInput extends MutationInput {
  @IsUUID() documentId: string;
  @IsArray()
  @ArrayMaxSize(80)
  @ValidateNested({ each: true })
  @Type(() => WordingProposal)
  changes: WordingProposal[];
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => DraftSectionInput)
  sections: DraftSectionInput[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => DraftQuestionInput)
  questions?: DraftQuestionInput[];
  @IsOptional() @IsArray() @ArrayMaxSize(2000)
  @ValidateNested({ each: true }) @Type(() => CvBaselineChange)
  baselineChanges?: CvBaselineChange[];
  @IsOptional() @IsArray() @ArrayMaxSize(2000)
  @IsString({ each: true }) @MaxLength(100, { each: true })
  baselineOrder?: string[];
}
