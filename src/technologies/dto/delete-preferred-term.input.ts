import { PartialType } from "@nestjs/mapped-types";
import { CreatePreferredTermInput } from "./create-preferred-term.input";

export class DeletePreferredTermInput extends PartialType(
  CreatePreferredTermInput,
) {}
