import { OmitType } from "@nestjs/swagger";
import { CreateOrganizationInput } from "./create-organization.input";

export class UpdateOrganizationInput extends OmitType(CreateOrganizationInput, [
  "orgId",
] as const) {}
