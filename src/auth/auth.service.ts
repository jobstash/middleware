import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { UserService } from "../user/user.service";
import { UserRoleService } from "../user/user-role.service";
import { WalletAuthorizationDto } from "../user/dto/wallet-authorization.dto";
import { AuthorizationResult } from "src/shared/interfaces";
import { IronSession, IronSessionOptions, getIronSession } from "iron-session";
import { Request, Response } from "express";

@Injectable()
export class AuthService {
  private readonly jwtConfig: object;
  private readonly sessionConfig: IronSessionOptions;
  private readonly logger = new CustomLogger(AuthService.name);
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly userRoleService: UserRoleService,
    private readonly userService: UserService,
  ) {
    this.jwtConfig = {
      secret: this.configService.get<string>("JWT_SECRET"),
      mutatePayload: false,
    };
    this.sessionConfig = {
      cookieName:
        configService.get<string>("COOKIE_NAME") || "connectkit-next-siwe",
      password: configService.get<string>("SESSION_SECRET"),
      cookieOptions: {
        secure: configService.get<string>("NODE_ENV") === "production",
      },
    };
  }

  async getSession<
    TSessionData extends Record<string, unknown> = Record<string, unknown>,
  >(req: Request, res: Response): Promise<IronSession & TSessionData> {
    const session = (await getIronSession(
      req,
      res,
      this.sessionConfig,
    )) as IronSession &
      TSessionData & {
        nonce?: string;
        address?: string;
        token?: string;
        role?: string;
        flow?: string;
        chainId?: number;
      };
    return session;
  }

  getLoggableSession<
    TSessionData extends Record<string, unknown> = Record<string, unknown>,
  >(
    session: IronSession &
      TSessionData & {
        nonce?: string;
        address?: string;
        token?: string;
        role?: string;
        flow?: string;
        chainId?: number;
      },
  ): IronSession & TSessionData {
    return {
      ...session,
      nonce: "[REDACTED]",
      token: "[REDACTED]",
    };
  }

  createToken(claim: object): string {
    const token = this.jwtService.sign(claim, this.jwtConfig);

    return token;
  }

  validateToken(token: string): boolean {
    try {
      this.jwtService.verify(token, this.jwtConfig);
      return true;
    } catch (error) {
      return false;
    }
  }

  decodeToken(token: string): object | string | null {
    try {
      return this.jwtService.decode(token, this.jwtConfig);
    } catch (error) {
      return null;
    }
  }

  async isWalletAuthorized(
    walletAuthorizationDto: WalletAuthorizationDto,
  ): Promise<AuthorizationResult> {
    const { wallet, requiredRoles } = walletAuthorizationDto;
    const user = this.userService.findByWallet(wallet);
    if (!user) {
      return {
        authorized: false,
        message: `Wallet ${wallet} not found`,
      };
    }

    const walletRole = await this.userRoleService.getRoleForWallet(wallet);
    const userRole = walletRole.getName();

    if (requiredRoles.includes(userRole)) {
      this.logger.log(
        `${this.isWalletAuthorized.name}: Wallet ${wallet} authorized for access, role: ${userRole}`,
      );
      return {
        authorized: true,
        message: `Wallet ${wallet} authorized for access`,
      };
    }

    this.logger.warn(
      `${this.isWalletAuthorized.name}: Wallet ${wallet} not authorized for access, role ${userRole}`,
    );

    Sentry.withScope(scope => {
      scope.setTags({
        action: "wallet-authorization-check",
        source: `auth.service`,
        issue: `${this.isWalletAuthorized.name}: Wallet ${wallet} not authorized for access, role ${userRole}`,
      });
    });

    return {
      authorized: false,
      message: `Wallet ${wallet} not authorized for access`,
    };
  }
}
