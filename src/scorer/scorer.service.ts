import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { AxiosError } from "axios";
import { catchError, firstValueFrom } from "rxjs";
import { UserWorkHistory } from "src/shared/interfaces";
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
    const token = await randomToken();
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
}
