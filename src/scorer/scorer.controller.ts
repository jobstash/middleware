import {
  Body,
  Controller,
  Get,
  Param,
  Post,
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
import { Request, Response } from "express";
import { SetupOrgLinkInput } from "./dto/setup-org-link.input";
import { ResponseWithNoData } from "src/shared/interfaces";
import { catchError, firstValueFrom } from "rxjs";
import { HttpService } from "@nestjs/axios";
import { AxiosError } from "axios";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { RetryCreateClientWebhooksInput } from "./dto/retry-create-client-webhooks.input";
import { CreateClientInput } from "./dto/create-client.input";

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

  @Get("oauth/lever")
  @Redirect()
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ORG)
  async triggerLeverOauth(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{
    url: string;
  }> {
    const { address } = await this.authService.getSession(req, res);

    if (address) {
      const orgId = await this.userService.findOrgIdByWallet(address as string);
      const key = await this.scorerService.generateEphemeralTokenForOrg(orgId);
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
  }

  @Post("setup")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ORG)
  async setupOrgLink(
    @Body() body: SetupOrgLinkInput,
  ): Promise<ResponseWithNoData> {
    const res = await firstValueFrom(
      this.httpService
        .get<ResponseWithNoData>(`/${body.preferences.platformName}/setup`)
        .pipe(
          catchError((err: AxiosError) => {
            Sentry.withScope(scope => {
              scope.setTags({
                action: "proxy-call",
                source: "scorer.controller",
              });
              scope.setExtra("input", body);
              Sentry.captureException(err);
            });
            this.logger.error(`ScorerController::setupOrgLink ${err.message}`);
            return [];
          }),
        ),
    );
    return res.data;
  }

  @Post("register/:platform")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ORG)
  async registerAccount(
    @Param("platform") platform: "workable" | "greenhouse",
    @Body() body: CreateClientInput,
  ): Promise<ResponseWithNoData> {
    if (["workable", "greenhouse"].includes(platform)) {
      const res = await firstValueFrom(
        this.httpService.get<ResponseWithNoData>(`/${platform}/setup`).pipe(
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
            return [];
          }),
        ),
      );
      return res.data;
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
      const res = await firstValueFrom(
        this.httpService.get<ResponseWithNoData>(`/${platform}/webhooks`).pipe(
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
            return [];
          }),
        ),
      );
      return res.data;
    } else {
      return {
        success: false,
        message: "Invalid platform",
      };
    }
  }
}
