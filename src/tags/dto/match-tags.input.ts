import { IsArray, IsNotEmpty } from "class-validator";

export class MatchTagsInput {
  @IsArray()
  @IsNotEmpty()
  tags: string[];
}
