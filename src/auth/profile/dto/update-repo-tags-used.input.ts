import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsString } from "class-validator";

export class UpdateRepoTagsUsedInput {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  id: string;

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
