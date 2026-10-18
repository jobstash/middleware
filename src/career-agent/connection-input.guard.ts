import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  PayloadTooLargeException,
  ValidationPipe,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { candidateOrigin } from "./candidate-origin";

export const connectionInputValidation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  validationError: { target: false, value: false },
  exceptionFactory: () => new BadRequestException("Invalid connection input"),
});

@Injectable()
export class ConnectionInputGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    if (request.method === "GET") return true;
    const origin = candidateOrigin(this.config);
    if (request.headers.origin !== origin)
      throw new ForbiddenException("Invalid request origin");
    const length = request.rawBody?.byteLength ?? Buffer.byteLength(JSON.stringify(request.body ?? null));
    if (length > 16 * 1024)
      throw new PayloadTooLargeException("Connection input exceeds limit");
    return true;
  }
}
