import { Injectable } from "@nestjs/common";
import { JwtService, JwtSignOptions } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Request, Response } from "express";
import { SessionObject } from "src/shared/interfaces";
import * as Sentry from "@sentry/node";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { GraphRepository } from "src/postgres/graph.repository";

@Injectable()
export class AuthService {
  private readonly logger = new CustomLogger(AuthService.name);
  private readonly jwtConfig: JwtSignOptions;
  constructor(
    private readonly graph: GraphRepository,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.jwtConfig = {
      secret: this.configService.getOrThrow<string>("JWT_SECRET"),
      algorithm: "HS256",
      expiresIn:
        this.configService.getOrThrow<JwtSignOptions["expiresIn"]>(
          "JWT_EXPIRES_IN",
        ),
      mutatePayload: false,
    };
  }

  async getSession(
    req: Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _res: Response,
  ): Promise<SessionObject | null> {
    const token = /^Bearer\s+(\S+)$/i.exec(
      req.headers?.authorization ?? "",
    )?.[1];
    if (token) {
      const decoded = this.verifyToken(token);
      if (decoded) {
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
          if (!user) {
            return { address: null, cryptoNative: false, permissions: [] };
          }
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
    return this.verifyToken(token) !== null;
  }

  private verifyToken(token: string): { address: string } | null {
    try {
      const claims = this.jwtService.verify<Record<string, unknown>>(token, {
        secret: this.jwtConfig.secret,
        algorithms: ["HS256"],
        ignoreExpiration: false,
        ignoreNotBefore: false,
        // Older issuers omitted exp; bound those signed tokens by iat too.
        maxAge: this.jwtConfig.expiresIn,
      });
      if (
        typeof claims.address !== "string" ||
        !claims.address.trim() ||
        typeof claims.iat !== "number" ||
        !Number.isFinite(claims.iat) ||
        claims.iat > Math.floor(Date.now() / 1000)
      ) {
        return null;
      }
      return { address: claims.address };
    } catch {
      // Invalid credentials are expected input, not an application exception.
      return null;
    }
  }
}
