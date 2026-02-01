import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsArray, IsBoolean, IsNotEmpty, IsString } from "class-validator";
import { toList } from "src/shared/helpers";

export class JobMatchInput {
  @ApiProperty()
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @Type(() => String)
  @Transform(toList)
  @Transform(({ value }) => (Array.isArray(value) ? value.slice(0, 30) : value))
  skills: string[];

  @ApiProperty()
  @Transform(({ value }) =>
    value === "true" ? true : value === "false" ? false : value,
  )
  @IsBoolean()
  isExpert: boolean;
}
