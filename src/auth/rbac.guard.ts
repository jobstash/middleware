import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Request, Response } from "express";
import { CheckWalletRoles } from "src/shared/constants";
import { AuthService } from "./auth.service";
import { SessionObject } from "src/shared/interfaces";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class RBACGuard implements CanActivate {
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

    const permittedRoles =
      this.reflector.get<string[]>("roles", context.getHandler()) || [];
    if (this.configService.get<string>("NODE_ENV") === "development") {
      return true;
    } else {
      if (
        !permittedRoles.length ||
        permittedRoles.includes(CheckWalletRoles.ANON)
      ) {
        return true;
      }
    }

    const hasPermission = permittedRoles.includes(session.role);
    if (session && session.role && hasPermission) {
      return true;
    } else {
      throw new ForbiddenException({
        success: false,
        message: "Forbidden resource: Insufficient permissions",
      });
    }
  }
}
