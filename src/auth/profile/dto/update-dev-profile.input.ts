import { ApiProperty } from "@nestjs/swagger";
import {
  IsBoolean,
  IsNotEmpty,
  IsNotEmptyObject,
  IsObject,
  IsString,
  ValidateNested,
} from "class-validator";
import { ContactType, ContactTypes } from "src/shared/interfaces";
import { UpdateDevContactInput } from "./update-dev-contact.input";
import { Type } from "class-transformer";
import { UpdateDevLocationInput } from "./update-dev-location.input";

export class UpdateDevUserProfileInput {
  @ApiProperty()
  @IsBoolean()
  @IsNotEmpty()
  availableForWork: boolean;

  @ApiProperty({
    enum: ContactTypes,
  })
  @IsString()
  @IsNotEmpty()
  preferred: ContactType;

  @ApiProperty()
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => UpdateDevContactInput)
  contact: UpdateDevContactInput;

  @ApiProperty()
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => UpdateDevLocationInput)
  location: UpdateDevLocationInput;
}
