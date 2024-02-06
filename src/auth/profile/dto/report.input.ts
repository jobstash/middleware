import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsObject, IsArray } from "class-validator";

export class ReportInput {
  @ApiProperty()
  @IsString()
  subject: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsObject()
  ctx: {
    ui: string;
    url: string;
    user: {
      role: string;
      flow: string;
      isConnected: boolean;
      isSignedIn: boolean;
    };
    ts: number;
  };

  @ApiProperty()
  @IsArray()
  @IsObject({ each: true })
  attachments: { path: string }[];
}
