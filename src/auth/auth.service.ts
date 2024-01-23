import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { IronSession, IronSessionOptions, getIronSession } from "iron-session";
import { Request, Response } from "express";

@Injectable()
export class AuthService {
  private readonly jwtConfig: object;
  private readonly sessionConfig: IronSessionOptions;
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
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
}
