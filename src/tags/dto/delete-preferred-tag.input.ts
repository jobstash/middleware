import { PartialType } from "@nestjs/mapped-types";
import { CreatePreferredTagInput } from "./create-preferred-tag.input";

export class DeletePreferredTagInput extends PartialType(
  CreatePreferredTagInput,
) {}
