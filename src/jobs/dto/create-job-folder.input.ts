import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsNotEmpty, IsString } from "class-validator";

export class CreateJobFolderInput {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsArray()
  jobs: string[];

  @ApiProperty()
  @IsBoolean()
  isPublic: boolean;
}
