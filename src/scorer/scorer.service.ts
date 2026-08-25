import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { AxiosError } from "axios";
import { catchError, firstValueFrom, map, of } from "rxjs";
import {
  AdjacentRepo,
  CandidateReport,
  EcosystemActivation,
  ResponseWithOptionalData,
  UserWorkHistory,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";

@Injectable()
export class ScorerService {
  private logger = new CustomLogger(ScorerService.name);

  constructor(private readonly httpService: HttpService) {}

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

  getCandidateReport = async (
    user: string,
    wallet?: string,
  ): Promise<ResponseWithOptionalData<CandidateReport>> => {
    try {
      const response = await firstValueFrom(
        this.httpService
          .get<
            ResponseWithOptionalData<CandidateReport>
          >("/scorer/users/report", { params: { user, ...(wallet ? { wallet } : {}) } })
          .pipe(map(result => result.data)),
      );
      return response;
    } catch (error) {
      const err = error as AxiosError;
      Sentry.withScope(scope => {
        scope.setTags({ action: "proxy-call", source: "scorer.service" });
        scope.setExtra("input", { user, hasWallet: Boolean(wallet) });
        Sentry.captureException(err);
      });
      this.logger.error(`ScorerService::getCandidateReport ${err.message}`);
      return {
        success: false,
        message: "Error generating candidate report",
      };
    }
  };

  getEcosystemActivationsForWallets = async (
    wallets: string[],
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
          {
            wallet: string;
            ecosystemActivations: EcosystemActivation[];
          }[]
        >(`/scorer/users/ecosystem-activations?wallets=${param}`)
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
              scope.setExtra("input", { wallets });
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
