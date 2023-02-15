export class ResponseEntity {
  success: boolean;
  message: string;
}

export class ValidationError {
  statusCode: number;
  message: string[];
  error: string;
}
