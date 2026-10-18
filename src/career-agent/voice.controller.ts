import {
  BadRequestException, Body, CanActivate, Controller, Delete, ExecutionContext,
  ForbiddenException, Get, Injectable, Param, PayloadTooLargeException, Post, Req,
  UseGuards, UsePipes, ValidationPipe,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import { PBACGuard } from "src/auth/pbac.guard";
import { CheckWalletPermissions } from "src/shared/constants";
import { Permissions, Session } from "src/shared/decorators";
import { SessionObject } from "src/shared/interfaces";
import { candidateOrigin } from "./candidate-origin";
import { DeviceAuthGuard, DeviceRequest } from "./device-execution.guard";
import { CreateDeviceVoiceInput } from "./voice-connection.dto";
import { exactObject, MAX_VOICE_EVENT_BYTES } from "./voice-protocol";
import { VoiceService } from "./voice.service";

@Injectable()
export class VoiceInputGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    if (request.method !== "GET" && request.headers.origin !== candidateOrigin(this.config))
      throw new ForbiddenException("Invalid request origin");
    const length = request.rawBody?.byteLength ?? Buffer.byteLength(JSON.stringify(request.body ?? null));
    if (length > MAX_VOICE_EVENT_BYTES) throw new PayloadTooLargeException("Voice input exceeds limit");
    return true;
  }
}

@Controller("profile/voice/sessions")
@UseGuards(PBACGuard, VoiceInputGuard)
@Permissions(CheckWalletPermissions.USER)
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}
  @Get("availability")
  availability(@Session() session: SessionObject) { return this.voice.availability(session.address); }
  // A human can revoke the owned session even if the native bridge is unreachable.
  @Delete(":id")
  close(@Session() session: SessionObject, @Param("id") id: string) { return this.voice.close(session.address, id); }
}

@Controller("device/voice/sessions")
@UseGuards(DeviceAuthGuard)
export class DeviceVoiceController {
  constructor(private readonly voice: VoiceService) {}
  @Post()
  @UsePipes(new ValidationPipe({
    transform: true, whitelist: true, forbidNonWhitelisted: true,
    validationError: { target: false, value: false },
    exceptionFactory: () => new BadRequestException("Invalid device voice input"),
  }))
  create(@Req() request: DeviceRequest, @Body() input: CreateDeviceVoiceInput) {
    return this.voice.create(request.device, input);
  }
  @Post(":id/events")
  event(@Req() request: DeviceRequest, @Param("id") id: string, @Body() input: unknown) {
    return this.voice.event(request.device, id, input);
  }
  @Post(":id/heartbeat")
  heartbeat(@Req() request: DeviceRequest, @Param("id") id: string, @Body() input: unknown) {
    exactObject(input, []);
    return this.voice.heartbeat(request.device, id);
  }
  @Post(":id/close")
  close(@Req() request: DeviceRequest, @Param("id") id: string, @Body() input: unknown) {
    return this.voice.closeDevice(request.device, id, input);
  }
}
