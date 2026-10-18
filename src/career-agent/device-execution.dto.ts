import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  Max,
  ValidateIf,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
  MinLength,
} from "class-validator";
import { devicePlatformOperations } from "./device-execution.protocol";

export class DevicePlatformInput {
  @IsIn(devicePlatformOperations) operation: typeof devicePlatformOperations[number];
  @IsObject() args: Record<string, unknown>;
}
export class DeviceLeaseInput {
  @IsUUID() leaseId: string;
}
export class DeviceEventInput extends DeviceLeaseInput {
  @IsUUID() eventId: string;
  @IsIn([
    "heartbeat",
    "text",
    "usage",
    "suggestions",
    "completed",
    "failed",
    "paused",
  ])
  type: string;
  @ValidateIf(
    (input: DeviceEventInput) =>
      input.type === "suggestions" || input.question !== undefined,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  question?: string;
  @ValidateIf(
    (input: DeviceEventInput) =>
      input.type === "suggestions" || input.replies !== undefined,
  )
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(80, { each: true })
  replies?: string[];
  @IsOptional() @IsString() @MaxLength(20000) text?: string;
  @IsOptional() @IsString() @MaxLength(1000) message?: string;
  @IsOptional()
  @IsIn(["turn_limit", "time_limit", "provider_limit", "request_failed"])
  code?: string;
  @IsOptional() @IsString() @MaxLength(200) model?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1000000000) inputTokens?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000000000) outputTokens?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000000000) cachedTokens?: number;
}
export class DeviceToolInput extends DeviceLeaseInput {
  @IsIn(["tools/list", "tools/call"]) method: string;
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsObject() arguments?: Record<string, unknown>;
}
