import { IsBoolean, IsOptional } from "class-validator";
import { NewSubscriptionInput } from "./new-subscription.input";
import { PartialType } from "@nestjs/mapped-types";

export class ChangeSubscriptionInput extends PartialType(NewSubscriptionInput) {
  @IsBoolean()
  @IsOptional()
  paygOptIn: boolean = false;
}
