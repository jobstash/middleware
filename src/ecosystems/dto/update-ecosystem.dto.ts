import { PartialType } from "@nestjs/swagger";
import { CreateEcosystemDto } from "./create-ecosystem.dto";

export class UpdateEcosystemDto extends PartialType(CreateEcosystemDto) {}
