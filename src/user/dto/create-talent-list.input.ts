import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class CreateTalentListInput {
  @ApiProperty({
    description: "The name of the talent list",
    example: "My Awesome Candidates",
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: "The description of the talent list",
    example: "My Awesome Candidates",
  })
  @IsString()
  @IsNotEmpty()
  description: string;
}
