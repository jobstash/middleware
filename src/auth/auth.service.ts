import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Request, Response } from "express";
import { SessionObject } from "src/shared/interfaces";

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
        return decoded;
      } else {
        return null;
      }
    } else {
      return null;
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
