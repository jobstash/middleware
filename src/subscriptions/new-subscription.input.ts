import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from "class-validator";

export class NewSubscriptionInput {
  @IsString()
  @IsNotEmpty()
  orgId: string;

  @IsString()
  @IsOptional()
  @IsIn(["starter", "growth", "pro", "max"])
  jobstash: "starter" | "growth" | "pro" | "max" | null = null;

  @IsString()
  @IsOptional()
  @IsIn(["lite", "plus", "elite", "ultra"])
  veri: "lite" | "plus" | "elite" | "ultra" | null = null;

  @IsBoolean()
  @IsOptional()
  stashAlert: boolean = false;

  @IsNumber()
  @IsOptional()
  extraSeats: number = 0;
}
