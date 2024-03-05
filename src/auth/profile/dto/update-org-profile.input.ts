import { ApiProperty } from "@nestjs/swagger";
import {
  IsNotEmpty,
  IsNotEmptyObject,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";

export class UpdateOrgUserProfileInput {
  @ApiProperty()
  @IsObject()
  @IsNotEmptyObject()
  contact: { preferred: string | null; value: string | null };

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  linkedin: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  calendly: string;

  @ApiProperty()
  @IsObject()
  @IsNotEmptyObject()
  internalReference: {
    referencePersonName: string;
    referencePersonRole: string;
    referenceContact: string;
    referenceContactPlatform: string;
  };
}
