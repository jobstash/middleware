import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsNotEmpty } from "class-validator";
import { toList } from "src/shared/helpers";

export class UpdateEcosystemOrgsDto {
  @ApiProperty()
  @IsNotEmpty()
  @Type(() => String)
  @Transform(toList)
  orgIds: string[];
}
