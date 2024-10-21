import { ApiPropertyOptional, OmitType } from "@nestjs/swagger";
import { CreateProjectInput } from "./create-project.input";
import { IsOptional, IsString } from "class-validator";

export class UpdateProjectInput extends OmitType(CreateProjectInput, [
  "orgId",
  "description",
]) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orgId: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description: string | null;
}
