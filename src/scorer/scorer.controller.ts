import {
  Body,
  Controller,
  Delete,
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
  CandidateReport,
  ResponseWithNoData,
  ResponseWithOptionalData,
  data,
} from "src/shared/interfaces";
import { catchError, firstValueFrom, map, of } from "rxjs";
import { HttpService } from "@nestjs/axios";
import { AxiosError } from "axios";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { RetryCreateClientWebhooksInput } from "./dto/retry-create-client-webhooks.input";
import { CreateClientInput } from "./dto/create-client.input";
import { UpdateClientPreferencesInput } from "./dto/update-client-preferences.input";
import { BaseClient } from "src/shared/interfaces/client.interface";
import { RetryCreateClientTagsInput } from "./dto/retry-create-client-tags.input";

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

  @Get("client")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ORG)
  async getClient(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<ResponseWithOptionalData<BaseClient>> {
    const { address } = await this.authService.getSession(req, res);

    if (address) {
      const orgId = await this.userService.findOrgIdByWallet(address);
      if (orgId) {
        const client = await this.scorerService.getAtsClientInfoByOrgId(orgId);
        const platform = client?.platform;
        if (client?.id && platform) {
          this.logger.log(`/scorer/client/${platform}/`);
          const result = await this.scorerService.getClientById(
            client?.id,
            platform,
          );
          if (platform === "greenhouse") {
            const res = data(result);
            return {
              success: true,
              message: "Client retrieved successfully",
              data: res,
            };
          } else {
            return result;
          }
        } else {
          return {
            success: true,
            message: "No client linked to this account",
            data: {
              id: null,
              name: null,
              orgId: null,
              hasTags: false,
              preferences: null,
              hasWebhooks: false,
            },
          };
        }
      } else {
        return {
          success: false,
          message: "Client not found",
        };
      }
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
        const orgId = await this.userService.findOrgIdByWallet(address);
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
  ): Promise<ResponseWithOptionalData<CandidateReport>> {
    this.logger.log(`/scorer/user/report`);
    try {
      const { address } = await this.authService.getSession(req, res);

      if (address) {
        const orgId = await this.userService.findOrgIdByWallet(address);
        const key = await this.scorerService.generateEphemeralTokenForOrg(
          orgId,
        );
        const client = await this.scorerService.getAtsClientInfoByOrgId(orgId);

        const clientId = client?.id;
        const platform = client?.platform;
        const userProfile = await this.userService.findProfileByWallet(address);
        const wallets = (userProfile?.linkedWallets ?? []).join(",");

        if (clientId && platform) {
          const res = await firstValueFrom(
            this.httpService
              .get<ResponseWithOptionalData<CandidateReport>>(
                `${this.configService.get<string>(
                  "SCORER_DOMAIN",
                )}/scorer/users/report?user=${user}&wallets=${wallets}&client_id=${clientId}&platform=${platform}&key=${key}`,
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
    @Res({ passthrough: true }) res: ExpressResponse,
    @Param("platform")
    platform: "lever" | "workable" | "greenhouse" | "jobstash",
    @Body() body: SetupOrgLinkInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/scorer/link/org/${platform}`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      const orgId = await this.userService.findOrgIdByWallet(address);
      try {
        const result = await this.httpService.axiosRef.post<ResponseWithNoData>(
          `/${platform}/link`,
          {
            clientId: body.clientId,
            orgId: orgId,
          },
        );
        return {
          success: result.data.success,
          message: result.data.message,
        };
      } catch (err) {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "proxy-call",
            source: "scorer.controller",
          });
          scope.setExtra("input", body);
          Sentry.captureException(err);
        });
        this.logger.error(`ScorerController::setupOrgLink ${err.message}`);
        return {
          success: false,
          message: "Error setting up org link",
        };
      }
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
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() body: UpdateClientPreferencesInput,
  ): Promise<ResponseWithOptionalData<string[]>> {
    this.logger.log(`/scorer/update/preferences`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      const result = await firstValueFrom(
        this.httpService
          .post<ResponseWithOptionalData<string[]>>(
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
      if (result.success === false) {
        return {
          success: result.success,
          message: result.message,
          data: data(result),
        };
      } else {
        return {
          success: result.success,
          message: result.message,
        };
      }
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
    @Param("platform") platform: "workable" | "greenhouse" | "jobstash",
    @Body() body: CreateClientInput,
  ): Promise<
    // Workable/JobStash case
    | ResponseWithOptionalData<BaseClient>
    // Greenhouse case
    | ResponseWithOptionalData<
        BaseClient & {
          // Greenhouse specific fields for webhooks
          applicationCreatedSignatureToken: string;
          candidateHiredSignatureToken: string;
        }
      >
  > {
    if (["workable", "greenhouse", "jobstash"].includes(platform)) {
      this.logger.log(`/scorer/register/${platform}`);
      const res:
        | ResponseWithOptionalData<BaseClient>
        // Greenhouse case
        | ResponseWithOptionalData<
            BaseClient & {
              // Greenhouse specific fields for webhooks
              applicationCreatedSignatureToken: string;
              candidateHiredSignatureToken: string;
            }
          > = await firstValueFrom(
        this.httpService
          .post<
            // Workable/JobStash case
            | ResponseWithOptionalData<BaseClient>
            // Greenhouse case
            | ResponseWithOptionalData<
                BaseClient & {
                  // Greenhouse specific fields for webhooks
                  applicationCreatedSignatureToken: string;
                  candidateHiredSignatureToken: string;
                }
              >
          >(`/${platform}/register`, body)
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

      if (data && res.success) {
        if (platform === "workable" || platform === "jobstash") {
          return {
            success: true,
            message: "Account registered",
            data: {
              id: result.id,
              name: result.name,
              hasTags: result.hasTags ?? false,
              hasWebhooks: result.hasWebhooks ?? false,
              orgId: result.orgId ?? null,
              preferences: result.preferences ?? null,
            },
          };
        } else {
          const temp = result as BaseClient & {
            // Greenhouse specific fields for webhooks
            applicationCreatedSignatureToken: string;
            candidateHiredSignatureToken: string;
          };
          return {
            success: true,
            message: "Account registered",
            data: {
              id: temp.id,
              name: temp.name,
              hasTags: temp.hasTags ?? false,
              hasWebhooks: temp.hasWebhooks ?? false,
              orgId: temp.orgId ?? null,
              preferences: temp.preferences ?? null,
              applicationCreatedSignatureToken:
                temp?.applicationCreatedSignatureToken,
              candidateHiredSignatureToken: temp?.candidateHiredSignatureToken,
            },
          };
        }
      } else {
        return res;
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
    @Param("platform") platform: "lever" | "workable" | "greenhouse",
    @Body() body: RetryCreateClientWebhooksInput,
  ): Promise<
    // Workable/JobStash case
    | ResponseWithNoData
    // Greenhouse case
    | ResponseWithOptionalData<{
        // Greenhouse specific fields for webhooks
        applicationCreatedSignatureToken: string;
        candidateHiredSignatureToken: string;
      }>
  > {
    if (["lever", "workable", "greenhouse"].includes(platform)) {
      this.logger.log(`/scorer/webhooks/${platform}`);
      const res = await firstValueFrom(
        this.httpService
          .post<ResponseWithNoData>(`/${platform}/webhooks`, body)
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
                `ScorerController::retryWebhooks ${err.message}`,
              );
              return of({
                success: false,
                message: "Error proxing webhook request",
              });
            }),
          ),
      );
      const result = data(res);

      if (res.success) {
        if (platform === "workable" || platform === "lever") {
          return res;
        } else {
          const temp = result as {
            // Greenhouse specific fields for webhooks
            applicationCreatedSignatureToken: string;
            candidateHiredSignatureToken: string;
          };
          return {
            success: true,
            message: res.message,
            data: {
              applicationCreatedSignatureToken:
                temp?.applicationCreatedSignatureToken,
              candidateHiredSignatureToken: temp?.candidateHiredSignatureToken,
            },
          };
        }
      } else {
        return res;
      }
    } else {
      return {
        success: false,
        message: "Invalid platform",
      };
    }
  }

  @Post("tags/greenhouse")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ORG)
  async retryTagsForGreenhouseClient(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() body: RetryCreateClientTagsInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/scorer/tags/greenhouse`);
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      const orgId = await this.userService.findOrgIdByWallet(address);
      if (orgId) {
        const result = await firstValueFrom(
          this.httpService
            .post<ResponseWithNoData>(`/greenhouse/tags`, body)
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
                  `ScorerController::retryTagsForGreenhouseClient ${err.message}`,
                );
                return of({
                  success: false,
                  message: "Error proxing tag request",
                });
              }),
            ),
        );
        if (result.success) {
          return {
            success: true,
            message: "Tags created successfully",
          };
        } else {
          return {
            success: false,
            message: "Error creating tags",
          };
        }
      } else {
        return {
          success: false,
          message: "Org not found",
        };
      }
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }

  @Delete("client")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ORG)
  async deleteClient(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<ResponseWithNoData> {
    const { address } = await this.authService.getSession(req, res);

    if (address) {
      const orgId = await this.userService.findOrgIdByWallet(address);
      if (orgId) {
        const client = await this.scorerService.getAtsClientInfoByOrgId(orgId);
        const platform = client?.platform;
        if (client?.id && platform) {
          this.logger.log(`/scorer/client/${platform}/`);
          return this.scorerService.deleteClientById(client?.id, platform);
        } else {
          return {
            success: false,
            message: "Client not found",
          };
        }
      } else {
        return {
          success: false,
          message: "Client not found",
        };
      }
    } else {
      res.status(HttpStatus.FORBIDDEN);
      return {
        success: false,
        message: "Access denied for unauthenticated user",
      };
    }
  }
}
