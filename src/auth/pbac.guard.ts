import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { SessionObject } from "src/shared/interfaces";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { CheckWalletPermissions } from "src/shared/constants";

@Injectable()
export class PBACGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest<Request & { user: SessionObject }>();
    const res = httpContext.getResponse<Response>();
    const session = await this.authService.getSession(req, res);
    req.user = session;

    const requiredPermissions =
      this.reflector.get<string[]>("permissions", context.getHandler()) || [];

    const canAccess =
      requiredPermissions.length === 0
        ? true
        : (session.permissions.includes(CheckWalletPermissions.SUPER_ADMIN) ||
            requiredPermissions.every(perm =>
              session.permissions.includes(perm),
            )) &&
          session?.address;

    if (canAccess) {
      return true;
    } else {
      throw new ForbiddenException({
        success: false,
        message: "Forbidden resource: Insufficient permissions",
      });
    }
  }
}
