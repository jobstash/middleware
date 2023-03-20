import { OmitType } from "@nestjs/mapped-types";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class Response<T> {
  @ApiProperty()
  success: boolean;
  @ApiProperty()
  message: string;
  @ApiPropertyOptional()
  data: T;
}

export class ResponseWithNoData extends OmitType(Response<null>, [
  "data",
] as const) {
  @ApiProperty()
  override success: boolean;

  @ApiProperty()
  override message: string;
}

export class ValidationError {
  @ApiProperty()
  statusCode: number;
  @ApiProperty()
  message: string[];
  @ApiProperty()
  error: string;
}
