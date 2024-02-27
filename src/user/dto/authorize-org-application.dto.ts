import {
  IsEnum,
  IsEthereumAddress,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";

export class AuthorizeOrgApplicationInput {
  @IsNotEmpty()
  @IsString()
  @IsEthereumAddress()
  wallet: string;

  @IsNotEmpty()
  @IsString()
  @IsIn(["approve", "reject"] as const)
  @IsEnum(["approve", "reject"] as const)
  verdict: "approve" | "reject";

  @IsOptional()
  @IsString()
  orgId: string;
}
