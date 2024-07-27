import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Request, Response } from "express";
import { SessionObject } from "src/shared/interfaces";
import { CheckWalletFlows, CheckWalletRoles } from "src/shared/constants";

@Injectable()
export class AuthService {
  private readonly jwtConfig: object;
  constructor(
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
        return {
          address: decoded.address ?? null,
          role: decoded.role ?? CheckWalletRoles.ANON,
          flow: decoded.flow ?? CheckWalletFlows.LOGIN,
          cryptoNative: decoded.cryptoNative ?? false,
        };
      } else {
        return {
          address: null,
          role: CheckWalletRoles.ANON,
          flow: CheckWalletFlows.LOGIN,
          cryptoNative: false,
        };
      }
    } else {
      return {
        address: null,
        role: CheckWalletRoles.ANON,
        flow: CheckWalletFlows.LOGIN,
        cryptoNative: false,
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
      return false;
    }
  }

  decodeToken(token: string): SessionObject | null {
    try {
      return this.jwtService.decode(token, this.jwtConfig);
    } catch (error) {
      return null;
    }
  }
}
