import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { PrivyClient, User } from "@privy-io/server-auth";
import { CustomLogger } from "src/shared/utils/custom-logger";

@Injectable()
export class PrivyGuard implements CanActivate {
  private privy: PrivyClient;
  private logger = new CustomLogger(PrivyGuard.name);
  constructor(private readonly configService: ConfigService) {
    this.privy = new PrivyClient(
      this.configService.get<string>("PRIVY_APP_ID"),
      this.configService.get<string>("PRIVY_APP_SECRET"),
    );
  }

  private async getSession(req: Request): Promise<User> {
    const accessToken =
      req.headers.authorization?.replace("Bearer ", "") ?? null;
    try {
      if (accessToken) {
        const verifiedClaims = await this.privy.verifyAuthToken(accessToken);
        return this.privy.getUserById(verifiedClaims.userId);
      } else {
        throw new ForbiddenException({
          success: false,
          message: "Forbidden resource: Insufficient permissions",
        });
      }
    } catch (error) {
      this.logger.error(`PrivyGuard::getSession ${error.message}`);
      throw new ForbiddenException({
        success: false,
        message: "Forbidden resource: Insufficient permissions",
      });
    }
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
