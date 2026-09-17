import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Header,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  RawBodyRequest,
  UnauthorizedException,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { PBACGuard } from "src/auth/pbac.guard";
import { Permissions, Session } from "src/shared/decorators";
import { CheckWalletPermissions } from "src/shared/constants";
import { SessionObject } from "src/shared/interfaces";
import { VisitorActivityService } from "./visitor-activity.service";
import {
  VisitorEventInput,
  VisitorQuery,
  VisitorDetailQuery,
} from "./visitor-activity.dto";

@Injectable()
export class VisitorIngestGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    const secret = process.env.VISITOR_INGEST_SECRET;
    const timestamp = req.header("x-visitor-time") ?? "";
    const signature = req.header("x-visitor-signature") ?? "";
    if (
      !secret ||
      secret.length < 32 ||
      !/^\d{13}$/.test(timestamp) ||
      Math.abs(Date.now() - Number(timestamp)) > 60_000 ||
      !/^[a-f0-9]{64}$/.test(signature) ||
      !req.rawBody
    )
      throw new UnauthorizedException();
    const expected = createHmac("sha256", secret)
      .update(timestamp + "." + (req.header("authorization") ?? "") + ".")
      .update(req.rawBody)
      .digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
      throw new UnauthorizedException();
    return true;
  }
}
const validation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
@Controller("telemetry/visitors")
export class VisitorActivityController {
  constructor(private readonly visitors: VisitorActivityService) {}

  @Post("events")
  @UseGuards(VisitorIngestGuard, PBACGuard)
  async record(
    @Body(validation) input: VisitorEventInput,
    @Session() session: SessionObject,
  ): Promise<{ success: boolean }> {
    await this.visitors.record(input, session?.address ?? null);
    return { success: true };
  }

  @Get()
  @Header("Cache-Control", "private, no-store")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  async list(
    @Query(validation) input: VisitorQuery,
  ): Promise<{ success: boolean; data: unknown }> {
    return { success: true, data: await this.visitors.list(input) };
  }

  @Get(":id")
  @Header("Cache-Control", "private, no-store")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  async detail(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query(validation) input: VisitorDetailQuery,
  ): Promise<{ success: boolean; data: unknown }> {
    return {
      success: true,
      data: await this.visitors.detail(id, input.days, input),
    };
  }
}
