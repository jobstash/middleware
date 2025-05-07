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
import { CheckWalletPermissions } from "src/shared/constants";

@Injectable()
export class PBACGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest<Request & { user: SessionObject }>();
    const res = httpContext.getResponse<Response>();
    const session = await this.authService.getSession(req, res);
    req.user = session;

    const requiredPermissions =
      this.reflector.get<string[] | string[][]>(
        "permissions",
        context.getHandler(),
      ) || [];

    const userPermissions = session?.permissions ?? [];

    const canAccess =
      requiredPermissions.length === 0
        ? true
        : (userPermissions.includes(CheckWalletPermissions.SUPER_ADMIN) ||
            requiredPermissions
              .filter(x => Array.isArray(x))
              .some(perm =>
                (perm as string[]).every(x => userPermissions.includes(x)),
              ) ||
            (requiredPermissions
              .filter(x => typeof x === "string")
              .every(x => userPermissions.includes(x as string)) &&
              requiredPermissions.filter(x => typeof x === "string").length >
                0)) &&
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
