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
    ts: number;
    other: string;
  };

  @ApiProperty()
  @IsArray()
  @IsObject({ each: true })
  attachments: { path: string }[];
}
