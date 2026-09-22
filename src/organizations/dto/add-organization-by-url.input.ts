import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUrl } from "class-validator";

export class AddOrganizationByUrlInput {
  @ApiProperty({
    required: false,
    enum: ["crypto", "fintech", "ai", "robotics", "banking", "tech"],
  })
  @IsOptional()
  @IsIn(["crypto", "fintech", "ai", "robotics", "banking", "tech"])
  vertical?: "crypto" | "fintech" | "ai" | "robotics" | "banking" | "tech";

  @ApiProperty()
  @IsOptional()
  @IsUrl()
  url: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string;
}
