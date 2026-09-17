import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsIP,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class VisitorEventInput {
  @IsOptional() @IsIP() ip?: string;
  @IsUUID() visitorId!: string;
  @IsIn(["request", "presence", "job_view"]) kind!: string;
  @IsString() @MaxLength(240) @Matches(/^\/[a-zA-Z0-9/_\-.]*$/) path!: string;
  @IsOptional() @Matches(/^[a-f0-9]{64}$/) networkKey?: string;
  @IsOptional() @Matches(/^[A-Z]{2}$/) country?: string;
  @IsOptional() @IsString() @MaxLength(180) browser?: string;
}
export class VisitorQuery {
  @Type(() => Number) @IsInt() @Min(0) @Max(36500) days = 7;
  @Type(() => Number) @IsInt() @Min(0) @Max(100000) offset = 0;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
  @IsIn([
    "id",
    "active",
    "signedIn",
    "hasSignedIn",
    "account",
    "ip",
    "country",
    "lastSeen",
    "requests",
    "anonymousViews",
    "views",
    "applies",
    "path",
    "lastBrowserSeen",
    "browser",
  ])
  sort = "lastSeen";
  @IsIn(["asc", "desc"]) direction = "desc";
  @IsIn(["all", "signed_in", "anonymous", "active"]) status = "all";
  @IsOptional() @Matches(/^[A-Z]{2}$/) country?: string;
  @IsOptional() @Matches(/^[a-f0-9]{64}$/) networkKey?: string;
}

export class VisitorDetailQuery {
  @Type(() => Number) @IsInt() @Min(0) @Max(36500) days = 7;
  @IsOptional() @IsIP() ip?: string;
  @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @Type(() => Number) @IsInt() @Min(0) eventOffset = 0;
  @IsIn([
    "at",
    "kind",
    "path",
    "requests",
    "signedIn",
    "country",
    "ip",
    "title",
    "account",
  ])
  sort = "at";
  @IsIn(["at", "kind", "title", "account"]) eventSort = "at";
  @IsIn(["asc", "desc"]) direction = "desc";
  @IsIn(["asc", "desc"]) eventDirection = "desc";
}
