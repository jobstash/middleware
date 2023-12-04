import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsNumber } from "class-validator";

export class UpdateRepoTagsUsedInput {
  @ApiProperty()
  @IsNumber()
  @IsNotEmpty()
  id: number;

  @ApiProperty()
  @IsArray()
  @IsNotEmpty()
  tagsUsed: {
    id: string;
    name: string;
    normalizedName: string;
    canTeach: boolean;
  }[];
}
