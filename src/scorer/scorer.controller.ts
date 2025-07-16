import {
  Body,
  Controller,
  Delete,
  BadRequestException,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Redirect,
  UseGuards,
  NotFoundException,
} from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { ScorerService } from "./scorer.service";
import { PBACGuard } from "src/auth/pbac.guard";
import { CheckWalletPermissions } from "src/shared/constants";
import { Permissions, Session } from "src/shared/decorators";
import { ConfigService } from "@nestjs/config";
import { UserService } from "src/user/user.service";
import { SetupOrgLinkInput } from "./dto/setup-org-link.input";
import {
  CandidateReport,
  ResponseWithNoData,
  ResponseWithOptionalData,
  SessionObject,
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
import { SubscriptionsService } from "src/subscriptions/subscriptions.service";
import { StripeService } from "src/stripe/stripe.service";

@Controller("scorer")
export class ScorerController {
  private readonly logger = new CustomLogger(ScorerController.name);
  constructor(
    private readonly httpService: HttpService,
    private readonly userService: UserService,
    private readonly scorerService: ScorerService,
    private readonly configService: ConfigService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly stripeService: StripeService,
  ) {}

  @Get("client")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
  async getClient(
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithOptionalData<BaseClient>> {
    const orgId = await this.userService.findOrgIdByMemberUserWallet(address);
    if (orgId) {
      const subscription = data(
        await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
      );
      if (subscription?.canAccessService("atsIntegration")) {
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
        throw new ForbiddenException({
          success: false,
          message:
            "Organization does not have an active or valid subscription to use this service",
        });
      }
    } else {
      throw new NotFoundException({
        success: false,
        message: "Client not found",
      });
    }
  }

  @Get("oauth/lever")
  @Redirect()
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
  async triggerLeverOauth(@Session() { address }: SessionObject): Promise<{
    url: string;
  }> {
    this.logger.log(`/scorer/oauth/lever`);
    try {
      const orgId = await this.userService.findOrgIdByMemberUserWallet(address);
      if (orgId) {
        const subscription = data(
          await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
        );
        if (subscription?.canAccessService("atsIntegration")) {
          const key =
            await this.scorerService.generateEphemeralTokenForOrg(orgId);
          return {
            url: `${this.configService.get<string>(
              "SCORER_DOMAIN",
            )}/lever/oauth?key=${key}`,
          };
        } else {
          return {
            url: "",
          };
        }
      } else {
        return {
          url: "",
        };
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
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  async generateUserReport(
    @Session() { address }: SessionObject,
    @Query("user") user: string,
    @Query("wallet") wallet: string,
  ): Promise<ResponseWithOptionalData<CandidateReport>> {
    this.logger.log(`/scorer/user/report`);
    try {
      const orgId = await this.userService.findOrgIdByMemberUserWallet(address);
      if (orgId) {
        const subscription = data(
          await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
        );
        if (subscription?.canAccessService("veri")) {
          const key =
            await this.scorerService.generateEphemeralTokenForOrg(orgId);
          const client =
            await this.scorerService.getAtsClientInfoByOrgId(orgId);

          const clientId = client?.id;
          const platform = client?.platform;

          if (clientId && platform) {
            const res = await firstValueFrom(
              this.httpService
                .get<
                  ResponseWithOptionalData<CandidateReport>
                >(`${this.configService.get<string>("SCORER_DOMAIN")}/scorer/users/report?user=${user}&wallet=${wallet}&client_id=${clientId}&platform=${platform}&key=${key}`)
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
            const result =
              await this.subscriptionsService.recordMeteredServiceUsage(
                orgId,
                address,
                1,
                "veri",
                this.stripeService,
              );
            if (result.success) {
              return res.data;
            } else {
              return result;
            }
          } else {
            const res = await firstValueFrom(
              this.httpService
                .get<
                  ResponseWithOptionalData<CandidateReport>
                >(`${this.configService.get<string>("SCORER_DOMAIN")}/scorer/users/report?user=${user}&wallet=${wallet}&key=${key}`)
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
            const result =
              await this.subscriptionsService.recordMeteredServiceUsage(
                orgId,
                address,
                1,
                "veri",
                this.stripeService,
              );
            if (result.success) {
              return res.data;
            } else {
              return result;
            }
          }
        } else {
          return {
            success: false,
            message:
              "You do not have access to this service. Please contact your admin for more information.",
          };
        }
      } else {
        return {
          success: false,
          message:
            "You do not have access to this service. Please contact your admin for more information.",
        };
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
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
  async setupOrgLink(
    @Session() { address }: SessionObject,
    @Param("platform")
    platform: "lever" | "workable" | "greenhouse" | "jobstash",
    @Body() body: SetupOrgLinkInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/scorer/link/org/${platform}`);
    try {
      const orgId = await this.userService.findOrgIdByMemberUserWallet(address);
      const subscription = data(
        await this.subscriptionsService.getSubscriptionInfoByOrgId(orgId),
      );
      if (subscription?.canAccessService("atsIntegration")) {
        const result = await this.httpService.axiosRef.post<ResponseWithNoData>(
          `/${platform}/link`,
          {
            clientId: body.clientId,
            orgId: orgId,
          },
        );
        return result.data;
      } else {
        throw new ForbiddenException({
          success: false,
          message:
            "Organization does not have an active or valid subscription to use this service",
        });
      }
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
      throw new BadRequestException({
        success: false,
        message: "Error setting up org link",
      });
    }
  }

  @Post("update/preferences")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
  async setupClientPreferences(
    @Session() session: SessionObject,
    @Body() body: UpdateClientPreferencesInput,
  ): Promise<ResponseWithOptionalData<string[]>> {
    this.logger.log(`/scorer/update/preferences`);
    const result = await this.getClient(session);
    if (result.success === false) {
      throw new BadRequestException({
        success: false,
        message: "Error updating client preferences",
      });
    } else {
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
              } as ResponseWithOptionalData<string[]>);
            }),
          ),
      );
      return result;
    }
  }

  @Post("register/:platform")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
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
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
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
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_MEMBER)
  async retryTagsForGreenhouseClient(
    @Session() { address }: SessionObject,
    @Body() body: RetryCreateClientTagsInput,
  ): Promise<ResponseWithNoData> {
    this.logger.log(`/scorer/tags/greenhouse`);
    const orgId = await this.userService.findOrgIdByMemberUserWallet(address);
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
  }

  @Delete("client")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER, CheckWalletPermissions.ORG_OWNER)
  async deleteClient(
    @Session() { address }: SessionObject,
  ): Promise<ResponseWithNoData> {
    const orgId = await this.userService.findOrgIdByMemberUserWallet(address);
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
  }
}
