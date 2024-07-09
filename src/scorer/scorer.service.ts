import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { AxiosError } from "axios";
import { catchError, firstValueFrom, map, of } from "rxjs";
import {
  ResponseWithNoData,
  ResponseWithOptionalData,
  UserGithubOrganization,
  UserLeanStats,
  UserWorkHistory,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { Neogma } from "neogma";
import { randomToken } from "src/shared/helpers";
import { BaseClient } from "src/shared/interfaces/client.interface";

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
  ): Promise<{
    id: string;
    platform: "lever" | "workable" | "greenhouse" | "jobstash";
  }> => {
    const result = await this.neogma.queryRunner.run(
      `
        MATCH (:Organization {orgId: $orgId})-[:HAS_ATS_CLIENT]->(client)
        RETURN {
          id: client.id,
          platform: client.name
        } as info
      `,
      { orgId },
    );
    const info = result.records[0]?.get("info") as {
      id: string;
      platform: "lever" | "workable" | "greenhouse" | "jobstash";
    };

    return {
      id: info?.id ?? null,
      platform: info?.platform ?? null,
    };
  };

  async getClientById(
    id: string,
    platform: "lever" | "workable" | "greenhouse" | "jobstash",
  ): Promise<ResponseWithOptionalData<BaseClient>> {
    const res = await firstValueFrom(
      this.httpService
        .get<ResponseWithOptionalData<BaseClient>>(`/${platform}/client/${id}`)
        .pipe(
          map(res => res.data),
          catchError((err: AxiosError) => {
            Sentry.withScope(scope => {
              scope.setTags({
                action: "proxy-call",
                source: "scorer.service",
              });
              Sentry.captureException(err);
            });
            this.logger.error(`ScorerService::getClientById ${err.message}`);
            return of({
              success: false,
              message: "Error getting client",
            });
          }),
        ),
    );
    return res;
  }

  async deleteClientById(
    id: string,
    platform: "lever" | "workable" | "greenhouse" | "jobstash",
  ): Promise<ResponseWithNoData> {
    const res = await firstValueFrom(
      this.httpService
        .delete<ResponseWithNoData>(`/${platform}/client/${id}`)
        .pipe(
          map(res => res.data),
          catchError((err: AxiosError) => {
            Sentry.withScope(scope => {
              scope.setTags({
                action: "proxy-call",
                source: "scorer.service",
              });
              Sentry.captureException(err);
            });
            this.logger.error(`ScorerService::deleteClientById ${err.message}`);
            return of({
              success: false,
              message: "Error deleting client",
            });
          }),
        ),
    );
    return res;
  }

  getWorkHistory = async (
    users: string[],
  ): Promise<{ user: string; workHistory: UserWorkHistory[] }[]> => {
    const res = await firstValueFrom(
      this.httpService
        .get<{ user: string; workHistory: UserWorkHistory[] }[]>(
          `/scorer/users/history?users=${users.join(",")}`,
        )
        .pipe(
          map(res => res.data),
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
            return of([] as { user: string; workHistory: UserWorkHistory[] }[]);
          }),
        ),
    );
    return res;
  };

  getUserOrgs = async (user: string): Promise<UserGithubOrganization[]> => {
    const res = await firstValueFrom(
      this.httpService
        .get<UserGithubOrganization[]>(`/scorer/users/orgs?user=${user}`)
        .pipe(
          map(res => res.data),
          catchError((err: AxiosError) => {
            Sentry.withScope(scope => {
              scope.setTags({
                action: "proxy-call",
                source: "scorer.service",
              });
              scope.setExtra("input", user);
              Sentry.captureException(err);
            });
            this.logger.error(`ScorerService::getUserOrgs ${err.message}`);
            return of([] as UserGithubOrganization[]);
          }),
        ),
    );
    return res;
  };

  getLeanStats = async (users: string[]): Promise<UserLeanStats[]> => {
    const res = await firstValueFrom(
      this.httpService
        .get<UserLeanStats[]>(`/scorer/users/stats?users=${users.join(",")}`)
        .pipe(
          map(res => res.data),
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
            return of([] as UserLeanStats[]);
          }),
        ),
    );
    return res;
  };

  getWalletEcosystemActivations = async (
    wallets: string[],
    orgId: string,
  ): Promise<{ wallet: string; ecosystemActivations: string[] }[]> => {
    const res = await firstValueFrom(
      this.httpService
        .get<{ wallet: string; ecosystemActivations: string[] }[]>(
          `/scorer/users/ecosystem-activations?wallets=${wallets.join(
            ",",
          )}&orgId=${orgId}`,
        )
        .pipe(
          map(res => res.data),
          catchError((err: AxiosError) => {
            Sentry.withScope(scope => {
              scope.setTags({
                action: "proxy-call",
                source: "scorer.service",
              });
              scope.setExtra("input", wallets);
              Sentry.captureException(err);
            });
            this.logger.error(`ScorerService::getLeanStats ${err.message}`);
            return of(
              [] as { wallet: string; ecosystemActivations: string[] }[],
            );
          }),
        ),
    );
    return res;
  };
}
