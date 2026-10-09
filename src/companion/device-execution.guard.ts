import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import { DeviceIdentity } from "./device-execution.protocol";
import { DeviceExecutionService } from "./device-execution.service";
export type DeviceRequest = Request & {
  rawBody?: Buffer;
  device: DeviceIdentity;
};
@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly devices: DeviceExecutionService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DeviceRequest>();
    const names = [
      "x-device-id",
      "x-device-time",
      "x-device-nonce",
      "x-device-signature",
    ];
    if (
      names.some(name => typeof request.headers[name] !== "string") ||
      (request.method !== "GET" && !Buffer.isBuffer(request.rawBody)) ||
      request.originalUrl.includes("?") ||
      request.headers.authorization !== undefined ||
      request.headers.cookie !== undefined
    )
      throw new ForbiddenException("Invalid device transport");
    request.device = await this.devices.authenticate({
      id: request.headers["x-device-id"] as string,
      time: request.headers["x-device-time"] as string,
      nonce: request.headers["x-device-nonce"] as string,
      signature: request.headers["x-device-signature"] as string,
      method: request.method,
      path: request.originalUrl,
      body: request.rawBody ?? Buffer.alloc(0),
    });
    return true;
  }
}
