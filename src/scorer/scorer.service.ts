import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { AxiosError } from "axios";
import { catchError, firstValueFrom } from "rxjs";
import { UserLeanStats, UserWorkHistory } from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { Neogma } from "neogma";
import { randomToken } from "src/shared/helpers";

@Injectable()
export class ScorerService {
  private logger = new CustomLogger(ScorerService.name);

  constructor(
    private neogma: Neogma,
    private readonly httpService: HttpService,
  ) {}

  generateEphemeralTokenForOrg = async (orgId: string): Promise<string> => {
    const token = randomToken();
    const result = await this.neogma.queryRunner.run(
      `
        CREATE (token:EphemeralToken {id: randomUUID(), token: $token})
        WITH token
        MATCH (org:Organization {orgId: $orgId})
        MERGE (org)-[:HAS_EPHEMERAL_TOKEN]->(token)
        RETURN token.token as token
      `,
      { orgId, token },
    );
    return result.records[0]?.get("token");
  };

  getAtsClientIdByOrgId = async (orgId: string): Promise<string> => {
    const result = await this.neogma.queryRunner.run(
      `
        MATCH (:Organization {orgId: $orgId})-[:HAS_ATS_CLIENT]->(client:LeverClient|WorkableClient|GreenhouseClient)
        RETURN client.id as id
      `,
      { orgId },
    );
    return result.records[0]?.get("id");
  };

  getAtsClientInfoByOrgId = async (
    orgId: string,
  ): Promise<{ id: string; platform: string }> => {
    const result = await this.neogma.queryRunner.run(
      `
        MATCH (:Organization {orgId: $orgId})-[:HAS_ATS_CLIENT]->(client:LeverClient|WorkableClient|GreenhouseClient)-[:HAS_PREFERENCES]->(preferences:AtsPreferences)
        RETURN {
          id: client.id,
          platform: preferences.platformName
        } as info
      `,
      { orgId },
    );
    return result.records[0]?.get("info") as { id: string; platform: string };
  };

  getWorkHistory = async (
    users: string[],
  ): Promise<{ user: string; workHistory: UserWorkHistory[] }[]> => {
    const res = await firstValueFrom(
      this.httpService
        .get<{ user: string; workHistory: UserWorkHistory[] }[]>(
          `/scorer/users/history?users=${users.join(",")}`,
        )
        .pipe(
          catchError((err: AxiosError) => {
            Sentry.withScope(scope => {
              scope.setTags({
                action: "proxy-call",
                source: "scorer.service",
              });
              scope.setExtra("input", users);
              Sentry.captureException(err);
            });
            this.logger.error(`ScorerService::getWorkHistory ${err.message}`);
            return [];
          }),
        ),
    );
    return res.data;
  };

  getLeanStats = async (users: string[]): Promise<UserLeanStats[]> => {
    const res = await firstValueFrom(
      this.httpService
        .get<UserLeanStats[]>(`/scorer/users/stats?users=${users.join(",")}`)
        .pipe(
          catchError((err: AxiosError) => {
            Sentry.withScope(scope => {
              scope.setTags({
                action: "proxy-call",
                source: "scorer.service",
              });
              scope.setExtra("input", users);
              Sentry.captureException(err);
            });
            this.logger.error(`ScorerService::getLeanStats ${err.message}`);
            return [];
          }),
        ),
    );
    return res.data;
  };
}
