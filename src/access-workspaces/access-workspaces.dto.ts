import { ApiProperty } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsString,
  IsUUID,
  MinLength,
} from "class-validator";

export const ACCESS_WORKSPACE_MEMBER_ROLES = [
  "admin",
  "analyst",
  "viewer",
] as const;

export class CreateAccessWorkspaceInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  primaryProfileId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  domain: string;
}

export class PutAccessWorkspaceMemberInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ enum: ACCESS_WORKSPACE_MEMBER_ROLES })
  @IsIn(ACCESS_WORKSPACE_MEMBER_ROLES)
  role: (typeof ACCESS_WORKSPACE_MEMBER_ROLES)[number];
}

export class InspectProfileInput {
  @ApiProperty()
  @IsUUID()
  workspaceId: string;
}

export class RevealInspectProfileInput extends InspectProfileInput {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  fields: string[];
}

export class TransferAccessWorkspaceDomainInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  domain: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  reason: string;

  @ApiProperty({
    description:
      "Explicitly authorizes transfer away from an active source workspace.",
  })
  @IsBoolean()
  superadminBypass: boolean;
}
