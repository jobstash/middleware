import { ApiProperty } from "@nestjs/swagger";

export class ResponseEntity {
  @ApiProperty()
  success: boolean;
  @ApiProperty()
  message: string;
}

export class ValidationError {
  @ApiProperty()
  statusCode: number;
  @ApiProperty()
  message: string[];
  @ApiProperty()
  error: string;
}
