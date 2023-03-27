// siwe.controller.ts
import {
  Controller,
  Get,
  Post,
  Res,
  HttpStatus,
  Body,
  Req,
  Redirect,
} from "@nestjs/common";
import { Request, Response as ExpressResponse } from "express";
import { getIronSession, IronSession, IronSessionOptions } from "iron-session";
import { BackendService } from "../../backend/backend.service";
import { AuthService } from "../auth.service";
import { VerifyMessageInput } from "../dto/verify-message.input";
import { generateNonce, SiweMessage } from "siwe";
import { ConfigService } from "@nestjs/config";
import { AlchemyProvider } from "@ethersproject/providers";
import {
  CheckWalletFlows,
  CheckWalletRoles,
  GithubConfig,
  ResponseWithNoData,
  SessionObject,
  User,
} from "src/shared/types";
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import { responseSchemaWrapper } from "src/shared/helpers";
import * as Sentry from "@sentry/node";
import { ADMIN_WALLETS } from "src/shared/presets/admin-wallets";
import { GithubLoginInput } from "./dto/github-login.input";
import axios from "axios";
import { UserService } from "../user/user.service";

@Controller("siwe")
@ApiExtraModels(SessionObject, User)
export class SiweController {
  private readonly sessionConfig: IronSessionOptions;
  private readonly ghConfig: GithubConfig;
  constructor(
    private readonly backendService: BackendService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {
    this.sessionConfig = {
      cookieName:
        configService.get<string>("COOKIE_NAME") || "connectkit-next-siwe",
      password: configService.get<string>("SESSION_SECRET"),
      cookieOptions: {
        secure: configService.get<string>("NODE_ENV") === "production",
        sameSite: "none",
      },
    };
    this.ghConfig = {
      clientID: this.configService.get<string>("GITHUB_OAUTH_CLIENT_ID"),
      clientSecret: this.configService.get<string>(
        "GITHUB_OAUTH_CLIENT_SECRET",
      ),
      scope: ["read:user", "read:org"],
    };
  }

  private async getSession<
    TSessionData extends Record<string, unknown> = Record<string, unknown>,
  >(
    req: Request,
    res: ExpressResponse,
    sessionConfig: IronSessionOptions,
  ): Promise<IronSession & TSessionData> {
    const session = (await getIronSession(
      req,
      res,
      sessionConfig,
    )) as IronSession &
      TSessionData & {
        nonce?: string;
        address?: string;
        chainId?: number;
      };
    return session;
  }

  @Get("nonce")
  @ApiOkResponse({
    description: "Returns a nonce generated for the SIWE flow",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async getNonce(
    @Req() req: Request,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    const session = await this.getSession(req, res, this.sessionConfig);
    if (!session.nonce) {
      session.nonce = generateNonce();
    }

    await session.save();

    res.send({
      success: true,
      message: "Nonce generated successfully",
      data: session.nonce as string,
    });
  }

  @Get("session")
  @ApiOkResponse({
    description: "Returns the session object for the SIWE flow",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(SessionObject),
    }),
  })
  async getSessionData(
    @Req() req: Request,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    const { address, chainId, role } = await this.getSession(
      req,
      res,
      this.sessionConfig,
    );
    res.send({
      success: true,
      message: "Session retrieved successfully",
      data: {
        address: address as string,
        chainId: chainId as number,
        role: role as string,
      },
    });
  }

  @Get("logout")
  @ApiOkResponse({
    description: "Ends the current session and clears the cookies",
  })
  async logout(
    @Req() req: Request,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    const session = await this.getSession(req, res, this.sessionConfig);
    session.destroy();
    res.status(HttpStatus.OK).end();
  }

  @Post("verify")
  @ApiOkResponse({
    description:
      "Verifies the message, creates the user and adds the wallet address, chain id and auth token to session",
  })
  @ApiUnprocessableEntityResponse({
    description: "An invalid or wrong nonce was passed",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  @ApiBadRequestResponse({
    description: "There was an error parsing the request",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async verify(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() body: VerifyMessageInput,
  ): Promise<ResponseWithNoData> {
    try {
      const provider = new AlchemyProvider(
        1,
        this.configService.get<string>("ALCHEMY_API_KEY"),
      );

      const session = await this.getSession(req, res, this.sessionConfig);
      const { message, signature } = body;
      const siweMessage = new SiweMessage(message);
      const fields = await siweMessage.validate(signature, provider);
      if (fields.nonce !== session.nonce) {
        res.status(HttpStatus.UNPROCESSABLE_ENTITY);
        return {
          success: false,
          message: "Invalid nonce!",
        };
      }

      this.backendService.createSIWEUser(siweMessage.address);

      session.token = this.authService.createToken(fields.address);
      session.address = fields.address;
      session.chainId = fields.chainId;
      await session.save();

      res.status(HttpStatus.OK).end();
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTag("message", body.message);
        scope.setTag("signature", body.signature);
        Sentry.captureException(error);
      });
      res.status(HttpStatus.BAD_REQUEST);
      return { success: false, message: error.message };
    }
  }

  @Get("check-wallet")
  @ApiOkResponse({
    description:
      "Returns the role of the user with the wallet embedded in the session cookie",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  @ApiForbiddenResponse({
    description: "Invalid or empty session detected",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  @ApiBadRequestResponse({
    description: "There was an error parsing the request",
    schema: {
      $ref: getSchemaPath(ResponseWithNoData),
    },
  })
  async checkWallet(
    @Req() req: Request,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    try {
      const session = await this.getSession(req, res, this.sessionConfig);

      if (session.address === undefined || session.address === null) {
        res.status(HttpStatus.OK);
        res.send({
          success: true,
          message: "Wallet checked successfully",
          data: {
            role: CheckWalletRoles.ANON,
            flow: CheckWalletFlows.LOGIN,
          },
        });
      } else {
        const isAdmin = ADMIN_WALLETS.includes(session.address as string);
        const role = isAdmin ? CheckWalletRoles.ADMIN : CheckWalletRoles.ANON;
        const flow = isAdmin
          ? CheckWalletFlows.ADMIN_SYNONYMS
          : CheckWalletFlows.PICK_ROLE;
        session.token = this.authService.createToken({
          wallet: session.address,
          role: role,
          flow: flow,
        });
        session.role = role;
        session.flow = flow;
        await session.save();
        res.send({
          success: true,
          message: "Wallet checked successfully",
          data: { role, flow },
        });
      }
    } catch (error) {
      Sentry.captureException(error);
      res.status(HttpStatus.BAD_REQUEST);
      res.send({ success: false, message: error.message });
    }
  }

  @Get("trigger-github-oauth")
  @Redirect("https://github.com/login/oauth/authorize", 301)
  triggerGithubOauth(): { url: string } {
    return {
      url: `https://github.com/login/oauth/authorize?scope=${this.ghConfig.scope.join(
        ",",
      )}&client_id=${this.ghConfig.clientID}`,
    };
  }

  @Post("github-login")
  @ApiOkResponse({
    description: "User has been authenticated successfully!",
    schema: { $ref: getSchemaPath(User) },
  })
  async githubLogin(@Body() body: GithubLoginInput): Promise<User | undefined> {
    const { wallet, code } = body;
    const userByWallet = await this.userService.findByWallet(wallet);

    if (!userByWallet) {
      return null;
    }

    const result = userByWallet.getProperties();
    // Todo: is this ok? How would we update the user github token/data?
    // Todo: handle the case where the user has already logged in but now some data is different
    if (result.githubId === undefined) {
      const { data: tokenData } = await axios.get(
        `https://github.com/login/oauth/access_token?client_id=${this.ghConfig.clientID}&client_secret=${this.ghConfig.clientSecret}&code=${code}`,
      );
      const { data: profileData } = await axios.get(
        "https://api.github.com/user",
        {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        },
      );
      return this.backendService.addGithubInfoToUser({
        githubAccessToken: tokenData.access_token,
        githubRefreshToken: tokenData.refresh_token,
        githubLogin: profileData.login,
        githubId: profileData.id,
        githubNodeId: profileData.node_id,
        githubGravatarId:
          profileData.gravatar_id === "" ? undefined : profileData.gravatar_id,
        githubAvatarUrl: profileData.avatar_url,
        wallet: wallet,
      });
    } else {
      return result;
    }
  }
}
