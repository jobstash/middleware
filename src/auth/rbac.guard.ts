import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request, Response as ExpressResponse } from "express";
import { getIronSession, IronSession, IronSessionOptions } from "iron-session";
import { Reflector } from "@nestjs/core";

@Injectable()
export class RBACGuard implements CanActivate {
  private readonly sessionConfig: IronSessionOptions;
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    this.sessionConfig = {
      cookieName:
        configService.get<string>("COOKIE_NAME") || "connectkit-next-siwe",
      password: configService.get<string>("SESSION_SECRET"),
      cookieOptions: {
        secure: configService.get<string>("NODE_ENV") === "production",
        sameSite: "none",
      },
    };
  }

  private async getSession<
    TSessionData extends Record<string, unknown> = Record<string, unknown>,
  >(
    req: Request,
    res: ExpressResponse,
    sessionConfig: IronSessionOptions,
  ): Promise<IronSession & TSessionData> {
    const session = (await getIronSession(
      req,
      res,
      sessionConfig,
    )) as IronSession &
      TSessionData & {
        nonce?: string;
        address?: string;
        chainId?: number;
      };
    return session;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest<Request>();
    const res = httpContext.getResponse<ExpressResponse>();
    const session = await this.getSession(req, res, this.sessionConfig);

    const permittedRoles =
      this.reflector.get<string[]>("roles", context.getHandler()) || [];

    if (!permittedRoles.length) {
      return true;
    }

    const hasPermission = permittedRoles.includes(session.role as string);
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
