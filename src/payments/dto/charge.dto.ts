import {
  IsString,
  IsNumber,
  IsDate,
  IsOptional,
  IsUUID,
  IsEmail,
  IsEnum,
  IsArray,
  IsBoolean,
  ValidateNested,
  IsUrl,
} from "class-validator";
import { Type } from "class-transformer";

export enum ChargeKind {
  WEB3 = "WEB3",
}

export enum PricingType {
  FIXED_PRICE = "fixed_price",
  NO_PRICE = "no_price",
}

export enum TimelineStatus {
  COMPLETED = "COMPLETED",
  EXPIRED = "EXPIRED",
  FAILED = "FAILED",
  NEW = "NEW",
  PENDING = "PENDING",
  SIGNED = "SIGNED",
}

export class Charge {
  @IsOptional()
  @IsString()
  brand_color?: string;

  @IsOptional()
  @IsUrl()
  brand_logo_url?: string;

  @IsOptional()
  @IsEnum(ChargeKind)
  charge_kind?: ChargeKind;

  @IsOptional()
  @ValidateNested()
  @Type(() => Checkout)
  checkout?: Checkout;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsDate()
  confirmed_at?: Date;

  @IsOptional()
  @IsDate()
  created_at?: Date;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDate()
  expires_at?: Date;

  @IsOptional()
  @IsUrl()
  hosted_url?: string;

  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  organization_name?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => Pricing)
  pricing?: Pricing;

  @IsOptional()
  @IsEnum(PricingType)
  pricing_type?: PricingType;

  @IsOptional()
  @ValidateNested()
  @Type(() => Redirects)
  redirects?: Redirects;

  @IsOptional()
  @IsEmail()
  support_email?: string;

  @IsOptional()
  @IsString()
  third_party_provider?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimelineEntry)
  timeline?: TimelineEntry[];

  @IsOptional()
  @ValidateNested()
  @Type(() => Web3Data)
  web3_data?: Web3Data;

  @IsOptional()
  @IsString()
  contract_address?: string;
}

class Checkout {
  @IsOptional()
  @IsString()
  id?: string;
}

class Pricing {
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalPricing)
  local?: LocalPricing;

  @IsOptional()
  @ValidateNested()
  @Type(() => SettlementPricing)
  settlement?: SettlementPricing;
}

class LocalPricing {
  @IsOptional()
  @IsString()
  amount?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}

class SettlementPricing {
  @IsOptional()
  @IsString()
  amount?: string;

  @IsOptional()
  @IsString()
  currency?: string;
}

class Redirects {
  @IsOptional()
  @IsString()
  cancel_url?: string;

  @IsOptional()
  @IsString()
  success_url?: string;

  @IsOptional()
  @IsBoolean()
  will_redirect_after_success?: boolean;
}

class TimelineEntry {
  @IsOptional()
  @IsEnum(TimelineStatus)
  status?: TimelineStatus;

  @IsOptional()
  @IsDate()
  time?: Date;
}

class Web3Data {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FailureEvent)
  failure_events?: FailureEvent[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SuccessEvent)
  success_events?: SuccessEvent[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TransferIntent)
  transfer_intent?: TransferIntent;

  @IsOptional()
  @ValidateNested()
  @Type(() => Metadata)
  metadata?: Metadata;
}

class FailureEvent {
  @IsOptional()
  @IsString()
  input_token_address?: string;

  @IsOptional()
  @IsString()
  network_fee_paid?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  sender?: string;

  @IsOptional()
  @IsDate()
  timestamp?: Date;

  @IsOptional()
  @IsString()
  tx_hsh?: string;
}

class SuccessEvent {
  @IsOptional()
  @IsBoolean()
  finalized?: boolean;

  @IsOptional()
  @IsString()
  input_token_address?: string;

  @IsOptional()
  @IsString()
  input_token_amount?: string;

  @IsOptional()
  @IsString()
  network_fee_paid?: string;

  @IsOptional()
  @IsString()
  recipient?: string;

  @IsOptional()
  @IsString()
  sender?: string;

  @IsOptional()
  @IsDate()
  timestamp?: Date;

  @IsOptional()
  @IsString()
  tx_hsh?: string;
}

class TransferIntent {
  @IsOptional()
  @ValidateNested()
  @Type(() => CallData)
  call_data?: CallData;

  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  operator?: string;

  @IsOptional()
  @IsString()
  prefix?: string;

  @IsOptional()
  @IsString()
  recipient?: string;

  @IsOptional()
  @IsString()
  recipient_amount?: string;

  @IsOptional()
  @IsString()
  recipient_currency?: string;

  @IsOptional()
  @IsString()
  refund_destination?: string;

  @IsOptional()
  @IsString()
  signature?: string;
}

class CallData {
  @IsOptional()
  @IsString()
  deadline?: string;

  @IsOptional()
  @IsString()
  fee_amount?: string;
}

class Metadata {
  @IsOptional()
  @IsNumber()
  chain_id?: number;

  @IsOptional()
  @IsString()
  contract_address?: string;

  @IsOptional()
  @IsString()
  sender?: string;
}
