import { PartialType } from "@nestjs/swagger";
import { CreateProjectInput } from "./create-project.input";

export class UpdateProjectInput extends PartialType(CreateProjectInput) {}
