// siwe.controller.ts
import {
  Controller,
  Get,
  Post,
  Res,
  HttpStatus,
  Body,
  Req,
  Header,
} from "@nestjs/common";
import { Request, Response as ExpressResponse } from "express";
import { AuthService } from "../auth.service";
import { VerifyMessageInput } from "../dto/verify-message.input";
import { generateNonce, SiweMessage } from "siwe";
import { ConfigService } from "@nestjs/config";
import { InfuraProvider } from "ethers";
import { ResponseWithNoData, SessionObject, User } from "src/shared/types";
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
import { UserService } from "../../user/user.service";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { NO_CACHE } from "src/shared/constants/cache-control";
import { CheckWalletRoles, CheckWalletFlows } from "src/shared/constants";

@Controller("siwe")
@ApiExtraModels(SessionObject, User)
export class SiweController {
  private readonly logger = new CustomLogger(SiweController.name);
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {}

  @Get("nonce")
  @Header("Cache-Control", NO_CACHE)
  @Header("Expires", "-1")
  @ApiOkResponse({
    description: "Returns a nonce generated for the SIWE flow",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async getNonce(
    @Req() req: Request,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    const session = await this.authService.getSession(req, res);
    this.logger.log(
      `/siwe/nonce: ${JSON.stringify(
        this.authService.getLoggableSession(session),
      )}`,
    );

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
  @Header("Cache-Control", NO_CACHE)
  @Header("Expires", "-1")
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
    const { address, chainId, role } = await this.authService.getSession(
      req,
      res,
    );
    this.logger.log(`/siwe/nonce: ${address}, ${chainId}, ${role}`);
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
  @Header("Cache-Control", NO_CACHE)
  @Header("Expires", "-1")
  @ApiOkResponse({
    description: "Ends the current session and clears the cookies",
  })
  async logout(
    @Req() req: Request,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    const session = await this.authService.getSession(req, res);
    this.logger.log(
      `/siwe/logout: ${JSON.stringify(
        this.authService.getLoggableSession(session),
      )}`,
    );
    session.destroy();
    res.status(HttpStatus.OK).end();
  }

  @Post("verify")
  @Header("Cache-Control", NO_CACHE)
  @Header("Expires", "-1")
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
      const provider = new InfuraProvider(
        1,
        null,
        this.configService.get<string>("INFURA_API_KEY"),
      );

      const session = await this.authService.getSession(req, res);
      this.logger.log(
        `/siwe/verify ${JSON.stringify(
          this.authService.getLoggableSession(session),
        )}`,
      );
      const { message, signature } = body;
      const siweMessage = new SiweMessage(message);
      const {
        data: fields,
        success,
        error,
      } = await siweMessage.verify(
        {
          signature,
          nonce: session.nonce as string,
        },
        { provider },
      );
      if (!success) {
        res.status(HttpStatus.BAD_REQUEST);
        return {
          success: false,
          message: error.type,
        };
      }

      await this.userService.createSIWEUser(siweMessage.address);

      session.token = this.authService.createToken({ address: fields.address });
      session.address = fields.address;
      session.chainId = fields.chainId;
      await session.save();

      res.status(HttpStatus.OK).end();
    } catch (error) {
      this.logger.error(`/siwe/verify ${JSON.stringify(error)}`);
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-action",
          source: "siwe.controller",
          message: body.message,
          signature: body.signature,
        });
        Sentry.captureException(error);
      });
      res.status(HttpStatus.BAD_REQUEST);
      return { success: false, message: error.message };
    }
  }

  @Get("check-wallet")
  @Header("Cache-Control", NO_CACHE)
  @Header("Expires", "-1")
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
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<void> {
    try {
      const session = await this.authService.getSession(req, res);
      this.logger.log(
        `/siwe/check-wallet ${JSON.stringify(
          this.authService.getLoggableSession(session),
        )}`,
      );

      if (session.address === undefined || session.address === null) {
        this.logger.log("/siwe/check-wallet could not find session address");
        res.send({
          success: true,
          message: "Wallet checked successfully",
          data: {
            role: CheckWalletRoles.ANON,
            flow: CheckWalletFlows.LOGIN,
            cryptoNative: false,
          },
        });
      } else {
        const userRole = await this.userService.getWalletRole(
          session.address as string,
        );
        const userFlow = await this.userService.getWalletFlow(
          session.address as string,
        );
        const userCryptoNative = await this.userService.getCryptoNativeStatus(
          session.address as string,
        );

        let role;
        let flow;
        let cryptoNative;
        if (userRole) {
          role = userRole.getName();
        } else {
          this.logger.log(`/siwe/check-wallet user role was ${userRole}`);

          role = CheckWalletRoles.ANON;
        }

        if (userFlow) {
          flow = userFlow.getName();
        } else {
          this.logger.log(`/siwe/check-wallet user flow was ${userFlow}`);
          flow = CheckWalletFlows.LOGIN;
        }

        if (userCryptoNative) {
          cryptoNative = userCryptoNative;
        } else {
          this.logger.log(
            `/siwe/check-wallet user crypto native was ${userCryptoNative}`,
          );
          cryptoNative = false;
        }

        session.token = this.authService.createToken({
          wallet: session.address,
          role,
          flow,
          cryptoNative,
        });
        session.role = role;
        session.flow = flow;
        session.cryptoNative = cryptoNative;
        await session.save();
        res.send({
          success: true,
          message: "Wallet checked successfully",
          data: { role, flow, cryptoNative },
        });
      }
    } catch (error) {
      this.logger.error(`/siwe/check-wallet`);
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-action",
          source: "siwe.controller",
        });
        Sentry.captureException(error);
      });
      res.status(HttpStatus.BAD_REQUEST);
      res.send({ success: false, message: error.message });
    }
  }

  @Post("update-flow")
  @Header("Cache-Control", NO_CACHE)
  @Header("Expires", "-1")
  @ApiOkResponse({
    description:
      "Updates the flow of the user with the wallet embedded in the session cookie",
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
  async updateFlow(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() body: { flow: string },
  ): Promise<void> {
    try {
      const session = await this.authService.getSession(req, res);
      this.logger.log(
        `/siwe/update-flow ${JSON.stringify(
          this.authService.getLoggableSession(session),
        )}`,
      );
      const { role, address } = session;
      const { flow } = body;

      if (!Object.values(CheckWalletFlows).includes(flow)) {
        res.status(HttpStatus.BAD_REQUEST);
        res.send({ success: false, message: "Invalid flow passed" });
      } else {
        if (address === undefined || address === null) {
          res.status(HttpStatus.FORBIDDEN);
          res.send({
            success: false,
            message: "No wallet found in session",
          });
        } else {
          if (
            (role !== undefined || role !== null) &&
            (role === CheckWalletRoles.DEV || role === CheckWalletRoles.ORG)
          ) {
            await this.userService.setWalletFlow({
              wallet: address as string,
              flow: flow,
            });
            session.token = this.authService.createToken({
              wallet: address,
              role: role,
              flow: flow,
            });
            session.role = role;
            session.flow = flow;
            await session.save();
            res.send({
              success: true,
              message: "Flow changed successfully",
              data: { role, flow },
            });
          } else {
            res.status(HttpStatus.FORBIDDEN);
            res.send({
              success: false,
              message: "No valid role found in session",
            });
          }
        }
      }
    } catch (error) {
      this.logger.error(`/siwe/update-flow`);
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-action",
          source: "siwe.controller",
        });
        Sentry.captureException(error);
      });
      res.status(HttpStatus.BAD_REQUEST);
      res.send({ success: false, message: error.message });
    }
  }
}
