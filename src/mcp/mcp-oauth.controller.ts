import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  Header,
  HttpCode,
  HttpException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { Response } from "express";
import { PBACGuard } from "src/auth/pbac.guard";
import { Permissions, Session } from "src/shared/decorators";
import { CheckWalletPermissions } from "src/shared/constants";
import { SessionObject } from "src/shared/interfaces";
import { mcpScopes, McpOAuthService } from "./mcp-oauth.service";

@Catch(HttpException)
export class McpBearerExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse();
    response.setHeader("Cache-Control", "no-store");
    if (status === 401) {
      response.setHeader("WWW-Authenticate", 'Bearer error="invalid_token"');
      response.status(401).json({
        error: "invalid_token",
        error_description: "Sign in to reconnect this app",
      });
      return;
    }
    if (status === 403 && typeof body === "object" && "error" in body &&
        body.error === "insufficient_scope") {
      const requested = "scope" in body && typeof body.scope === "string" ? body.scope.split(" ") : [];
      const scopes = mcpScopes.filter(scope => requested.includes(scope)).join(" ");
      response.setHeader("WWW-Authenticate", `Bearer error="insufficient_scope"${scopes ? `, scope="${scopes}"` : ""}`);
      response.status(403).json({
        error: "insufficient_scope",
        ...(scopes ? { scope: scopes } : {}),
        error_description: scopes ? `Reconnect this app and approve ${scopes}` : "Reconnect this app and approve the required permissions",
      });
      return;
    }
    // Membership, provider and validation errors are not authentication failures.
    response.status(status).json(typeof body === "string" ? { statusCode: status, message: body } : body);
  }
}

@Controller()
export class McpDiscoveryController {
  constructor(private readonly oauth: McpOAuthService) {}
  @Get(".well-known/oauth-authorization-server/mcp") metadata() {
    return this.oauth.metadata();
  }
}
@Controller("mcp")
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class McpOAuthController {
  constructor(private readonly oauth: McpOAuthService) {}
  @Post("register") register(@Body() body: Record<string, unknown>) {
    return this.oauth.register(body ?? {});
  }
  @Get("authorize") async authorize(
    @Query() query: Record<string, unknown>,
    @Res() res: Response,
  ) {
    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, await this.oauth.authorize(query));
  }
  @Post("token")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  token(@Body() body: Record<string, unknown>) {
    return this.oauth.exchange(body ?? {});
  }
  @Post("revoke")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  async revoke(@Body() body: Record<string, unknown>) {
    await this.oauth.revokeToken(body ?? {});
    return {};
  }
}
@Controller("profile/mcp")
@UseGuards(PBACGuard)
@Permissions(CheckWalletPermissions.USER)
export class McpConnectionsController {
  constructor(private readonly oauth: McpOAuthService) {}
  @Get("connections") @Header("Cache-Control", "no-store") connections(@Session() user: SessionObject) {
    return this.oauth.connections(user.address);
  }
  @Get("authorization/:id") @Header("Cache-Control", "no-store") info(
    @Session() user: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.oauth.consentInfo(user.address, id);
  }
  @Post("authorization/:id")
  @Header("Cache-Control", "no-store")
  consent(
    @Session() user: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { approved: boolean },
  ) {
    return this.oauth.consent(user.address, id, body?.approved);
  }
  @Post("connections/:id/disconnect")
  @Header("Cache-Control", "no-store")
  disconnect(
    @Session() user: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.oauth.disconnect(user.address, id);
  }
}
