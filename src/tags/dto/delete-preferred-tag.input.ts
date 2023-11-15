import { CreatePreferredTagInput } from "./create-preferred-tag.input";
import { OmitType } from "@nestjs/swagger";

export class DeletePreferredTagInput extends OmitType(CreatePreferredTagInput, [
  "synonyms",
]) {}
