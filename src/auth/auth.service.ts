import { CACHE_MANAGER, Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { InjectAuthentication } from "@twirelab/nestjs-auth0";
import { AuthenticationClient } from "auth0";
import { Cache } from "cache-manager";

@Injectable()
export class AuthService {
  private readonly jwtConfig: object;
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    @InjectAuthentication()
    private readonly authClient: AuthenticationClient,
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
  ) {
    this.jwtConfig = {
      secret: this.configService.get<string>("JWT_SECRET"),
      mutatePayload: false,
    };
  }

  createToken(claim: string | object): string {
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

  async getBackendCredentialsGrantToken(): Promise<string> {
    const cacheValue = await this.cacheManager.get<string>(
      "client-credentials-token",
    );
    if (
      cacheValue !== null &&
      cacheValue !== undefined &&
      cacheValue !== "<unset>"
    ) {
      return cacheValue;
    } else {
      const newToken = await this.authClient.clientCredentialsGrant({
        audience: this.configService.get<string>("BACKEND_API_URL"),
        scope: "middleware:admin",
      });
      await this.cacheManager.set(
        "client-credentials-token",
        newToken.access_token,
        newToken.expires_in * 1000,
      );
      return newToken.access_token;
    }
  }
}
