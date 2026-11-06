import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { PrivyClient, User } from "@privy-io/node";
import { CustomLogger } from "src/shared/utils/custom-logger";

@Injectable()
export class PrivyGuard implements CanActivate {
  private static readonly MAX_AUTH_ATTEMPTS = 4;
  private privy: PrivyClient;
  private logger = new CustomLogger(PrivyGuard.name);
  constructor(private readonly configService: ConfigService) {
    this.privy = new PrivyClient({
      appId: this.configService.get<string>("PRIVY_APP_ID"),
      appSecret: this.configService.get<string>("PRIVY_APP_SECRET"),
    });
  }

  private async getSession(req: Request): Promise<User> {
    const accessToken =
      req.headers.authorization?.replace("Bearer ", "") ?? null;
    if (!accessToken) {
      throw new ForbiddenException({
        success: false,
        message: "Forbidden resource: Insufficient permissions",
      });
    }

    let lastError: unknown;
    for (
      let attempt = 1;
      attempt <= PrivyGuard.MAX_AUTH_ATTEMPTS;
      attempt += 1
    ) {
      try {
        const verifiedClaims = await this.privy
          .utils()
          .auth()
          .verifyAccessToken(accessToken);
        return await this.privy.users()._get(verifiedClaims.user_id);
      } catch (error) {
        lastError = error;
        if (attempt < PrivyGuard.MAX_AUTH_ATTEMPTS) {
          const retryDelayMs = 250 * 2 ** (attempt - 1);
          this.logger.warn(
            `PrivyGuard::getSession attempt ${attempt} failed; retrying in ${retryDelayMs}ms`,
          );
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
      }
    }

    const message =
      lastError instanceof Error ? lastError.message : "Unknown Privy error";
    this.logger.error(
      `PrivyGuard::getSession failed after retries: ${message}`,
    );
    throw new ForbiddenException({
      success: false,
      message: "Forbidden resource: Insufficient permissions",
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const httpContext = context.switchToHttp();
      const req = httpContext.getRequest<Request & { user: User }>();
      const user = await this.getSession(req);

      req.user = user;

      if (user) {
        return true;
      } else {
        return false;
      }
    } catch (err) {
      this.logger.error(`PrivyGuard::canActivate ${err.message}`);
      throw new ForbiddenException({
        success: false,
        message: "Forbidden resource: Insufficient permissions",
      });
    }
  }
}
