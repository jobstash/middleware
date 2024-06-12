import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Redirect,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { ScorerService } from "./scorer.service";
import { RBACGuard } from "src/auth/rbac.guard";
import { CheckWalletRoles } from "src/shared/constants";
import { Roles } from "src/shared/decorators";
import { ConfigService } from "@nestjs/config";
import { UserService } from "src/user/user.service";
import { AuthService } from "src/auth/auth.service";
import { Request, Response as ExpressResponse } from "express";
import { SetupOrgLinkInput } from "./dto/setup-org-link.input";
import {
  ResponseWithNoData,
  ResponseWithOptionalData,
  UserLeanStats,
  UserWorkHistory,
  data,
} from "src/shared/interfaces";
import { catchError, firstValueFrom, map, of } from "rxjs";
import { HttpService } from "@nestjs/axios";
import { AxiosError } from "axios";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { RetryCreateClientWebhooksInput } from "./dto/retry-create-client-webhooks.input";
import { CreateClientInput } from "./dto/create-client.input";
import { ATSClient } from "src/shared/interfaces/client.interface";
import { UpdateClientPreferencesInput } from "./dto/update-client-preferences.input";

@Controller("scorer")
export class ScorerController {
  private readonly logger = new CustomLogger(ScorerController.name);
  constructor(
    private readonly scorerService: ScorerService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly authService: AuthService,
    private readonly httpService: HttpService,
  ) {}

  @Get("client/:platform")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ORG)
  async getClient(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Param("platform")
    platform: "lever" | "workable" | "greenhouse",
  ): Promise<ResponseWithOptionalData<ATSClient>> {
    this.logger.log(`/client/${platform}`);
    const { address } = await this.authService.getSession(req, res);

    if (address) {
      const orgId = await this.userService.findOrgIdByWallet(address as string);
      const client = await this.scorerService.getAtsClientInfoByOrgId(orgId);
      return this.scorerService.getClientById(client?.id, platform);
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Get("oauth/lever")
  @Redirect()
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ORG)
  async triggerLeverOauth(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<{
    url: string;
  }> {
    this.logger.log(`/scorer/oauth/lever`);
    try {
      const { address } = await this.authService.getSession(req, res);

      if (address) {
        const orgId = await this.userService.findOrgIdByWallet(
          address as string,
        );
        const key = await this.scorerService.generateEphemeralTokenForOrg(
          orgId,
        );
        return {
          url: `${this.configService.get<string>(
            "SCORER_DOMAIN",
          )}/lever/oauth?key=${key}`,
        };
      } else {
        throw new UnauthorizedException({
          message: "You are not authorized to access this resource",
        });
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "proxy-call",
          source: "scorer.controller",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`ScorerController::triggerLeverOauth ${err.message}`);
      return {
        url: "",
      };
    }
  }

  @Get("user/report")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ORG)
  async generateUserReport(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Query("user") user: string,
    @Query("wallet") wallet: string,
  ): Promise<
    ResponseWithOptionalData<{
      login: string;
      nfts: string[];
      stats: UserLeanStats;
      workHistory: UserWorkHistory[];
    }>
  > {
    this.logger.log(`/scorer/user/report`);
    try {
      const { address } = await this.authService.getSession(req, res);

      if (address) {
        const orgId = await this.userService.findOrgIdByWallet(
          address as string,
        );
        const key = await this.scorerService.generateEphemeralTokenForOrg(
          orgId,
        );
        const client = await this.scorerService.getAtsClientInfoByOrgId(orgId);

        const clientId = client?.id;
        const platform = client?.platform;

        if (clientId && platform) {
          const res = await firstValueFrom(
            this.httpService
              .get<
                ResponseWithOptionalData<{
                  login: string;
                  nfts: string[];
                  stats: UserLeanStats;
                  workHistory: UserWorkHistory[];
                }>
              >(
                `${this.configService.get<string>(
                  "SCORER_DOMAIN",
                )}/scorer/users/report?user=${user}&wallet=${wallet}&client_id=${clientId}&platform=${platform}&key=${key}`,
              )
              .pipe(
                catchError((err: AxiosError) => {
                  Sentry.withScope(scope => {
                    scope.setTags({
                      action: "proxy-call",
                      source: "scorer.controller",
                    });
                    scope.setExtra("input", { user, wallet });
                    Sentry.captureException(err);
                  });
                  this.logger.error(
                    `ScorerController::generateUserReport ${err.message}`,
                  );
                  return [];
                }),
              ),
          );
          return res.data;
        } else {
          return { success: false, message: "Client preferences not found" };
        }
      } else {
        throw new UnauthorizedException({
          success: false,
          message: "You are not authorized to access this resource",
        });
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "proxy-call",
          source: "scorer.controller",
        });
        scope.setExtra("input", { user, wallet });
        Sentry.captureException(err);
      });
      this.logger.error(`ScorerController::generateUserReport ${err.message}`);
      return {
        success: false,
        message: "Error generating user report",
      };
    }
  }

  @Post("link/org/:platform")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ORG)
  async setupOrgLink(
    @Req() req: Request,
    @Res() res: ExpressResponse,
    @Param("platform") platform: "lever" | "workable" | "greenhouse",
    @Body() body: SetupOrgLinkInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/scorer/link/org/${platform}`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      const orgId = await this.userService.findOrgIdByWallet(address as string);
      const result = await firstValueFrom(
        this.httpService
          .post<ResponseWithNoData>(`/${platform}/link`, {
            clientId: body.clientId,
            orgId: orgId,
          })
          .pipe(
            map(res => res.data),
            catchError((err: AxiosError) => {
              Sentry.withScope(scope => {
                scope.setTags({
                  action: "proxy-call",
                  source: "scorer.controller",
                });
                scope.setExtra("input", body);
                Sentry.captureException(err);
              });
              this.logger.error(
                `ScorerController::setupOrgLink ${err.message}`,
              );
              return of({
                success: false,
                message: "Error setting up org link",
              });
            }),
          ),
      );
      return result;
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Post("update/preferences")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ORG)
  async setupClientPreferences(
    @Req() req: Request,
    @Res() res: ExpressResponse,
    @Body() body: UpdateClientPreferencesInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/scorer/setup`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      const result = await firstValueFrom(
        this.httpService
          .post<ResponseWithNoData>(
            `/${body.preferences.platformName}/update/preferences`,
            {
              clientId: body.clientId,
              preferences: body.preferences,
            },
          )
          .pipe(
            map(res => res.data),
            catchError((err: AxiosError) => {
              Sentry.withScope(scope => {
                scope.setTags({
                  action: "proxy-call",
                  source: "scorer.controller",
                });
                scope.setExtra("input", body);
                Sentry.captureException(err);
              });
              this.logger.error(
                `ScorerController::updateClientPreferences ${err.message}`,
              );
              return of({
                success: false,
                message: "Error updating client preferences",
              });
            }),
          ),
      );
      return result;
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Post("register/:platform")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ORG)
  async registerAccount(
    @Param("platform") platform: "workable" | "greenhouse",
    @Body() body: CreateClientInput,
  ): Promise<
    // Workable case
    | ResponseWithOptionalData<ATSClient>
    // Greenhouse case
    | ResponseWithOptionalData<
        ATSClient & {
          // Greenhouse specific fields for webhooks
          applicationCreatedSignatureToken: string;
          candidateHiredSignatureToken: string;
        }
      >
  > {
    if (["workable", "greenhouse"].includes(platform)) {
      this.logger.log(`/scorer/register/${platform}`);
      const res:
        | ResponseWithOptionalData<ATSClient>
        // Greenhouse case
        | ResponseWithOptionalData<
            ATSClient & {
              // Greenhouse specific fields for webhooks
              applicationCreatedSignatureToken: string;
              candidateHiredSignatureToken: string;
            }
          > = await firstValueFrom(
        this.httpService
          .get<
            | ResponseWithOptionalData<ATSClient>
            // Greenhouse case
            | ResponseWithOptionalData<
                ATSClient & {
                  // Greenhouse specific fields for webhooks
                  applicationCreatedSignatureToken: string;
                  candidateHiredSignatureToken: string;
                }
              >
          >(`/${platform}/register`)
          .pipe(
            map(res => res.data),
            catchError((err: AxiosError) => {
              Sentry.withScope(scope => {
                scope.setTags({
                  action: "proxy-call",
                  source: "scorer.controller",
                });
                scope.setExtra("input", body);
                Sentry.captureException(err);
              });
              this.logger.error(
                `ScorerController::registerAccount ${err.message}`,
              );
              return of({
                success: false,
                message: "Error registering account",
              });
            }),
          ),
      );

      const result = data(res);

      if (platform === "workable") {
        return {
          success: true,
          message: "Account registered",
          data: {
            id: result.id,
            hasWebhooks: result.hasWebhooks,
            orgId: result.orgId,
            preferences: result.preferences,
          },
        };
      } else {
        const temp = result as ATSClient & {
          // Greenhouse specific fields for webhooks
          applicationCreatedSignatureToken: string;
          candidateHiredSignatureToken: string;
        };
        return {
          success: true,
          message: "Account registered",
          data: {
            id: temp.id,
            hasWebhooks: temp.hasWebhooks,
            orgId: temp.orgId,
            preferences: temp.preferences,
            applicationCreatedSignatureToken:
              temp?.applicationCreatedSignatureToken,
            candidateHiredSignatureToken: temp?.candidateHiredSignatureToken,
          },
        };
      }
    } else {
      return {
        success: false,
        message: "Invalid platform",
      };
    }
  }

  @Post("webhooks/:platform")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ORG)
  async retryWebhooks(
    @Param("platform") platform: "lever" | "workable",
    @Body() body: RetryCreateClientWebhooksInput,
  ): Promise<ResponseWithNoData> {
    if (["lever", "workable"].includes(platform)) {
      this.logger.log(`/scorer/webhooks/${platform}`);
      const res = await firstValueFrom(
        this.httpService.get<ResponseWithNoData>(`/${platform}/webhooks`).pipe(
          map(res => res.data),
          catchError((err: AxiosError) => {
            Sentry.withScope(scope => {
              scope.setTags({
                action: "proxy-call",
                source: "scorer.controller",
              });
              scope.setExtra("input", body);
              Sentry.captureException(err);
            });
            this.logger.error(`ScorerController::retryWebhooks ${err.message}`);
            return of({
              success: false,
              message: "Error proxing webhook request",
            });
          }),
        ),
      );
      return res;
    } else {
      return {
        success: false,
        message: "Invalid platform",
      };
    }
  }
}
