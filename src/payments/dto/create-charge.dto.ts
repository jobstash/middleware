import {
  IsString,
  IsNotEmpty,
  IsOptional,
  ValidateNested,
  IsEnum,
  IsUrl,
  IsObject,
} from "class-validator";
import { Type } from "class-transformer";

export enum PricingType {
  FIXED_PRICE = "fixed_price",
  NO_PRICE = "no_price",
}

class LocalPrice {
  @IsString()
  @IsNotEmpty()
  amount: string;

  @IsString()
  @IsNotEmpty()
  currency: string;
}

export class CreateCharge {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  buyer_locale?: string;

  @IsOptional()
  @IsUrl()
  cancel_url?: string;

  @IsOptional()
  @IsString()
  checkout_id?: string;

  @ValidateNested()
  @Type(() => LocalPrice)
  local_price: LocalPrice;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, string>;

  @IsEnum(PricingType)
  pricing_type: PricingType;

  @IsOptional()
  @IsUrl()
  redirect_url?: string;
}
