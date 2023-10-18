import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty } from "class-validator";

export class UpdateUserSkillsInput {
  @ApiProperty()
  @IsArray()
  @IsNotEmpty()
  skills: { id: string; name: string; canTeach: boolean }[][];
}
