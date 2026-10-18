import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Post,
  UseGuards,
  UseFilters,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { PBACGuard } from "src/auth/pbac.guard";
import { Permissions, Session } from "src/shared/decorators";
import { CheckWalletPermissions } from "src/shared/constants";
import { SessionObject } from "src/shared/interfaces";
import { McpDataService } from "./mcp-data.service";
import { McpBearerExceptionFilter } from "./mcp-oauth.controller";
@Controller("mcp/data")
@UseGuards(ThrottlerGuard)
@UseFilters(McpBearerExceptionFilter)
@Throttle({ default: { limit: 120, ttl: 60000 } })
export class McpDataController {
  constructor(private readonly data: McpDataService) {}
  @Get("identity") @Header("Cache-Control", "no-store") identity(
    @Headers("authorization") auth: string,
  ) {
    return this.data.identity(auth);
  }
  @Get("tools") @Header("Cache-Control", "no-store") tools(
    @Headers("authorization") auth: string,
  ) {
    return this.data.tools(auth);
  }
  @Post("call") @HttpCode(200) @Header("Cache-Control", "no-store") call(
    @Headers("authorization") auth: string,
    @Body() body: unknown,
  ) {
    return this.data.call(auth, body);
  }
}
@Controller("profile/mcp")
@UseGuards(PBACGuard)
@Permissions(CheckWalletPermissions.USER)
export class McpUsageController {
  constructor(private readonly data: McpDataService) {}
  @Get("status") @Header("Cache-Control", "no-store") status(
    @Session() user: SessionObject,
  ) {
    return this.data.status(user.address);
  }
}
