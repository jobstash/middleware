import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { AxiosError } from "axios";
import { catchError, firstValueFrom, map, of } from "rxjs";
import {
  AdjacentRepo,
  EcosystemActivation,
  ResponseWithNoData,
  ResponseWithOptionalData,
  UserWorkHistory,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { randomToken } from "src/shared/helpers";
import { BaseClient } from "src/shared/interfaces/client.interface";
import { GraphRepository } from "src/postgres/graph.repository";
import { randomUUID } from "node:crypto";

@Injectable()
export class ScorerService {
  private logger = new CustomLogger(ScorerService.name);

  constructor(
    private readonly graph: GraphRepository,
    private readonly httpService: HttpService,
  ) {}

  generateEphemeralTokenForOrg = async (orgId: string): Promise<string> => {
    const token = randomToken();
    return this.graph.transaction(async manager => {
      const organization = await this.graph.findNode<Record<string, unknown>>(
        "Organization",
        { orgId },
        manager,
      );
      if (!organization) {
        throw new Error(`Organization ${orgId} was not found`);
      }
      const id = randomUUID();
      const tokenNode = await this.graph.createNode(
        "EphemeralToken",
        { id, token },
        `runtime:${id}`,
        manager,
      );
      await this.graph.upsertRelationship({
        sourceNodeId: organization.nodeId,
        targetNodeId: tokenNode.nodeId,
        type: "HAS_EPHEMERAL_TOKEN",
        executor: manager,
      });
      return token;
    });
  };

  getAtsClientIdByOrgId = async (orgId: string): Promise<string> => {
    const [client] = await this.graph.findRelatedNodes<Record<string, unknown>>(
      {
        sourceLabel: "Organization",
        sourceWhere: { orgId },
        relationshipType: "HAS_ATS_CLIENT",
      },
    );
    return client?.properties.id as string | undefined;
  };

  getAtsClientInfoByOrgId = async (
    orgId: string,
  ): Promise<{
    id: string;
    platform: "lever" | "workable" | "greenhouse" | "jobstash";
  }> => {
    const [client] = await this.graph.findRelatedNodes<Record<string, unknown>>(
      {
        sourceLabel: "Organization",
        sourceWhere: { orgId },
        relationshipType: "HAS_ATS_CLIENT",
      },
    );

    return {
      id: (client?.properties.id as string | undefined) ?? null,
      platform:
        (client?.properties.name as
          | "lever"
          | "workable"
          | "greenhouse"
          | "jobstash"
          | undefined) ?? null,
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

  getUserWorkHistories = async (
    users: { github: string | null; wallets: string[] }[],
  ): Promise<
    {
      username: string | null;
      wallets: {
        address: string;
        ecosystemActivations: EcosystemActivation[];
      }[];
      cryptoNative: boolean;
      workHistory: UserWorkHistory[];
      adjacentRepos: AdjacentRepo[];
    }[]
  > => {
    const params = Buffer.from(JSON.stringify(users)).toString("base64");
    const res = await firstValueFrom(
      this.httpService
        .get<
          {
            username: string | null;
            wallets: {
              address: string;
              ecosystemActivations: EcosystemActivation[];
            }[];
            cryptoNative: boolean;
            workHistory: UserWorkHistory[];
            adjacentRepos: AdjacentRepo[];
          }[]
        >(`/scorer/users/history?params=${params}`)
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
            this.logger.error(`ScorerService::getWorkHistories ${err.message}`);
            return of(
              [] as {
                username: string | null;
                wallets: {
                  address: string;
                  ecosystemActivations: EcosystemActivation[];
                }[];
                cryptoNative: boolean;
                workHistory: UserWorkHistory[];
                adjacentRepos: AdjacentRepo[];
              }[],
            );
          }),
        ),
    );
    return res;
  };

  getAllUserEcosystemActivations = async (
    orgId: string,
  ): Promise<
    { wallet: string; ecosystemActivations: EcosystemActivation[] }[]
  > => {
    return firstValueFrom(
      this.httpService
        .get<
          { wallet: string; ecosystemActivations: EcosystemActivation[] }[]
        >(`/scorer/users/ecosystem-activations/all?orgId=${orgId}`)
        .pipe(
          map(res => res.data),
          catchError((err: AxiosError) => {
            Sentry.withScope(scope => {
              scope.setTags({
                action: "proxy-call",
                source: "scorer.service",
              });
              scope.setExtra("input", orgId);
              Sentry.captureException(err);
            });
            this.logger.error(
              `ScorerService::getWalletEcosystemActivations ${err.message}`,
            );
            return of([]);
          }),
        ),
    );
  };

  getEcosystemActivationsForWallets = async (
    wallets: string[],
    orgId: string | null,
  ): Promise<
    ResponseWithOptionalData<
      {
        wallet: string;
        ecosystemActivations: EcosystemActivation[];
      }[]
    >
  > => {
    const param = Buffer.from(JSON.stringify(wallets)).toString("base64");
    return firstValueFrom(
      this.httpService
        .get<
          ResponseWithOptionalData<
            {
              wallet: string;
              ecosystemActivations: EcosystemActivation[];
            }[]
          >
        >(`/scorer/users/ecosystem-activations?wallets=${param}&orgId=${orgId}`)
        .pipe(
          map(res => ({
            success: true,
            message: "Ecosystem activations retrieved successfully",
            data: res.data,
          })),
          catchError((err: AxiosError) => {
            Sentry.withScope(scope => {
              scope.setTags({
                action: "proxy-call",
                source: "scorer.service",
              });
              scope.setExtra("input", { wallets, orgId });
              Sentry.captureException(err);
            });
            this.logger.error(
              `ScorerService::getWalletEcosystemActivations ${err.message}`,
            );
            return of({
              success: false,
              message: "Error retrieving ecosystem activations",
            });
          }),
        ),
    );
  };
}
