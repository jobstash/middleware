import { CreateAuditDto } from "./create-audit.dto";
import { OmitType } from "@nestjs/mapped-types";

export class UpdateAuditDto extends OmitType(CreateAuditDto, [
  "projectId",
] as const) {}
