import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
  MinLength,
  ValidateIf,
} from "class-validator";
import { MutationInput } from "./career.dto";
export class SelectConnectionModelInput extends MutationInput {
  @IsString()
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$(?![\s\S])/)
  model: string;
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Matches(/^[a-z][a-z0-9_-]{0,31}$(?![\s\S])/)
  reasoningEffort: string | null;
}
export class SessionInput extends MutationInput {
  @IsUUID() connectionId: string;
  @IsOptional() @IsUUID() continueFromSessionId?: string;
  @IsOptional() @IsUUID() sourceDocumentId?: string;
  @IsOptional()
  @IsIn(["cv", "application", "stack", "comparison", "category"])
  objectKind?: "cv" | "application" | "stack" | "comparison" | "category";
  @IsOptional() @IsUUID() objectId?: string;
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  classification?: string;
}
export class PromptInput extends MutationInput {
  @IsString() @MinLength(1) @MaxLength(20000) prompt: string;
}
