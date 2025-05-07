import { PartialType } from "@nestjs/swagger";
import { CreateStoredFilterDto } from "./create-stored-filter.dto";

export class UpdateStoredFilterDto extends PartialType(CreateStoredFilterDto) {}
