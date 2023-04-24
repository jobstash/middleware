import { CACHE_MANAGER, Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { InjectAuthentication } from "@twirelab/nestjs-auth0";
import { AuthenticationClient, TokenResponse } from "auth0";
import { Cache } from "cache-manager";
import { CustomLogger } from "src/shared/utils/custom-logger";

@Injectable()
export class AuthService {
  private readonly jwtConfig: object;
  logger = new CustomLogger(AuthService.name);
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

  async getBackendCredentialsGrantToken(): Promise<TokenResponse | undefined> {
    try {
      const cacheValue = await this.cacheManager.get<TokenResponse>(
        "client-credentials-token",
      );
      if (cacheValue !== null && cacheValue !== undefined) {
        this.logger.log("Found cached backend token");
        return cacheValue;
      } else {
        this.logger.log("Requesting new backend token");
        const newToken = await this.authClient.clientCredentialsGrant({
          audience: this.configService.get<string>("AUTH0_AUDIENCE"),
          scope: "middleware:admin",
        });
        await this.cacheManager.set(
          "client-credentials-token",
          newToken,
          newToken.expires_in * 1000,
        );
        return newToken;
      }
    } catch (err) {
      this.logger.error(err.message);
      return undefined;
    }
  }
}
