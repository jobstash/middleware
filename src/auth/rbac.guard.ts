import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

@Injectable()
export class RBACGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permittedRoles =
      this.reflector.get<string[]>("roles", context.getHandler()) || [];

    if (!permittedRoles.length) {
      return true;
    }

    const { session } = context.switchToHttp().getRequest();
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
