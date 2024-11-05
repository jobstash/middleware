import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { Cache } from "cache-manager";
import * as Sentry from "@sentry/node";
import { CustomLogger } from "src/shared/utils/custom-logger";

@Injectable()
export class Auth0Service {
  private readonly logger = new CustomLogger(Auth0Service.name);
  constructor(
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async getETLToken(): Promise<string | undefined> {
    try {
      const existingToken = await this.cacheManager.get<string>("etl-token");
      if (existingToken) {
        return existingToken;
      } else {
        const clientId = this.configService.get<string>("ETL_CLIENT_ID");
        const clientSecret =
          this.configService.get<string>("ETL_CLIENT_SECRET");

        const auth0Domain = this.configService.get<string>("AUTH0_DOMAIN");
        const audience = this.configService.get<string>("AUTH0_AUDIENCE");
        const response = await axios.post(`${auth0Domain}/oauth/token`, {
          client_id: clientId,
          client_secret: clientSecret,
          audience,
          grant_type: "client_credentials",
        });
        if (response.data) {
          const authToken = response.data.access_token;
          await this.cacheManager.set("etl-token", authToken, 43_200_000);
          return authToken;
        } else {
          throw new Error("Error fetching auth token");
        }
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "external-api-call",
          source: "projects.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`Auth0Service::getETLToken ${err.message}`);
      return undefined;
    }
  }
}
