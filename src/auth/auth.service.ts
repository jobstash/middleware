import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Request, Response } from "express";
import { SessionObject } from "src/shared/interfaces";
import * as Sentry from "@sentry/node";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { GraphRepository } from "src/postgres/graph.repository";

@Injectable()
export class AuthService {
  private readonly logger = new CustomLogger(AuthService.name);
  private readonly jwtConfig: object;
  constructor(
    private readonly graph: GraphRepository,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.jwtConfig = {
      secret: this.configService.get<string>("JWT_SECRET"),
      mutatePayload: false,
    };
  }

  async getSession(
    req: Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _res: Response,
  ): Promise<SessionObject | null> {
    const token = req.headers?.authorization?.replace("Bearer ", "") ?? null;
    if (token) {
      const decoded = this.decodeToken(token);
      if (decoded) {
        if (!decoded.address) {
          return { address: null, cryptoNative: false, permissions: [] };
        }
        try {
          const [user, permissions] = await Promise.all([
            this.graph.findNode<Record<string, unknown>>("User", {
              wallet: decoded.address,
            }),
            this.graph.findRelatedNodes<Record<string, unknown>>({
              sourceLabel: "User",
              sourceWhere: { wallet: decoded.address },
              relationshipType: "HAS_PERMISSION",
              targetLabel: "UserPermission",
            }),
          ]);
          return {
            address: decoded.address ?? null,
            cryptoNative: (user?.properties.cryptoNative as boolean) ?? false,
            permissions: permissions
              .map(permission => permission.properties.name as string)
              .filter(Boolean),
          };
        } catch (error) {
          Sentry.withScope(scope => {
            scope.setTags({
              action: "db-call",
              source: "auth.service",
            });
            Sentry.captureException(error);
          });
          this.logger.error(`AuthService::getSession ${error.message}`);
          return null;
        }
      } else {
        return {
          address: null,
          cryptoNative: false,
          permissions: [],
        };
      }
    } else {
      return {
        address: null,
        cryptoNative: false,
        permissions: [],
      };
    }
  }

  createToken(claim: SessionObject): string {
    const token = this.jwtService.sign(claim, this.jwtConfig);

    return token;
  }

  validateToken(token: string): boolean {
    try {
      this.jwtService.verify(token, this.jwtConfig);
      return true;
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "token-validation",
          source: "auth.service",
        });
        Sentry.captureException(error);
      });
      this.logger.error(`AuthService::validateToken ${error.message}`);
      return false;
    }
  }

  decodeToken(token: string): SessionObject | null {
    try {
      return this.jwtService.decode(token, this.jwtConfig);
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "token-decoding",
          source: "auth.service",
        });
        Sentry.captureException(error);
      });
      this.logger.error(`AuthService::decodeToken ${error.message}`);
      return null;
    }
  }
}
