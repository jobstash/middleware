import { Type } from "class-transformer";
import { Equals, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from "class-validator";
import { BrowserActionResult, BrowserDeviceReceipt, BrowserInterruption, BrowserObservation, interruptionReasons } from "./browser-application.protocol";
export class BrowserPrepareInput { @IsUUID() documentId: string; }
class BrowserConsent {
  @Equals(true) browserControl: true;
  @Equals(true) dataTransfer: true;
}
export class BrowserStartInput extends BrowserPrepareInput {
  @IsUUID() requestId: string;
  @IsInt() @Min(1) revision: number;
  @IsUUID() connectionId: string;
  @IsString() @Matches(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/) model: string;
  @ValidateIf((_o, value) => value !== null) @IsString() @Matches(/^[a-z][a-z0-9_-]{0,31}$/) reasoningEffort: string | null;
  @IsObject() metadata: Record<string, string>;
  @ValidateNested() @Type(() => BrowserConsent) @IsObject() consent: BrowserConsent;
}
class BrowserResultInput implements BrowserActionResult {
  @IsUUID() commandId: string;
  @IsIn(["ok", "blocked", "error"]) status: BrowserActionResult["status"];
  @ValidateIf((_o, value) => value !== null) @IsString() @MaxLength(1000) message: string | null;
  @IsBoolean() submitted: boolean;
  @IsOptional() @IsIn(interruptionReasons) reason?: BrowserActionResult["reason"];
}
class BrowserInterruptionInput implements BrowserInterruption {
  @IsIn(interruptionReasons) reason: BrowserInterruption["reason"];
  @ValidateIf((_o, value) => value !== null) @IsString() @MaxLength(2048) url: string | null;
  @ValidateIf((_o, value) => value !== null) @IsUUID() commandId: string | null;
  @IsBoolean() submitted: boolean;
  @IsOptional() @IsIn(["navigation", "network"]) scope?: "navigation" | "network";
  @IsOptional() @IsBoolean() submitAttempted?: boolean;
}
export class BrowserStepInput {
  @IsUUID() eventId: string;
  @IsUUID() clientId: string;
  @IsString() @MaxLength(100) token: string;
  @IsInt() @Min(0) @Max(100) sequence: number;
  @IsOptional() @IsObject() observation?: BrowserObservation;
  @IsOptional() @IsObject() proposal?: BrowserDeviceReceipt;
  @IsOptional() @ValidateNested() @Type(() => BrowserResultInput) result?: BrowserResultInput;
  @IsOptional() @ValidateNested() @Type(() => BrowserInterruptionInput) interruption?: BrowserInterruptionInput;
}
export class BrowserApproveInput {
  @IsUUID() requestId: string;
  @IsUUID() commandId: string;
  @IsString() @Matches(/^[a-f0-9]{64}$/) observationHash: string;
  @IsObject() receipt: BrowserDeviceReceipt;
}
export class BrowserAnswerInput {
  @IsUUID() requestId: string;
  @IsString() @MaxLength(100) questionId: string;
  @IsString() @MaxLength(4000) value: string;
}
export class BrowserControlInput {
  @IsUUID() requestId: string;
  @IsIn(["pause", "resume", "cancel"]) action: "pause" | "resume" | "cancel";
}
