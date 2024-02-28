import { ApiProperty } from "@nestjs/swagger";
import {
  IsBoolean,
  IsNotEmpty,
  IsNotEmptyObject,
  IsObject,
} from "class-validator";

export class UpdateDevUserProfileInput {
  @ApiProperty()
  @IsBoolean()
  @IsNotEmpty()
  availableForWork: boolean;

  @ApiProperty()
  @IsObject()
  @IsNotEmptyObject()
  contact: { preferred: string | null; value: string | null };

  @ApiProperty()
  @IsObject()
  @IsNotEmptyObject()
  location: { country: string | null; city: string | null };
}
