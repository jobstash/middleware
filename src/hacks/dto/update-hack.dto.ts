import { PartialType } from "@nestjs/swagger";
import { CreateHackDto } from "./create-hack.dto";

export class UpdateHackDto extends PartialType(CreateHackDto) {}
