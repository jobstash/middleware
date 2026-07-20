import { IsNotEmpty, IsString, Matches } from "class-validator";

export class UpdateThreatIntelAccessDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^0x[a-fA-F0-9]{40}$/)
  wallet: string;
}
