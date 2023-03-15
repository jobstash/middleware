// siwe.controller.ts
import {
  Controller,
  Get,
  Post,
  Res,
  HttpStatus,
  HttpException,
  Body,
  Session,
} from "@nestjs/common";
import { Request, Response } from "express";
import { getIronSession, IronSession, IronSessionOptions } from "iron-session";
import { BackendService } from "../../backend/backend.service";
import { AuthService } from "../auth.service";
import { VerifyMessageInput } from "../dto/verify-message.input";
import { generateNonce, SiweMessage } from "siwe";
import { ConfigService } from "@nestjs/config";
import { AlchemyProvider } from "@ethersproject/providers";

@Controller("siwe")
export class SiweController {
  constructor(
    private readonly backendService: BackendService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private async getSession<
    TSessionData extends Record<string, unknown> = Record<string, unknown>,
  >(
    req: Request,
    res: Response,
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
  async getNonce(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Session() session: Record<string, any>,
  ): Promise<void> {
    // const session = await this.getSession(req, res, this.sessionConfig);
    if (!session.nonce) {
      session.nonce = generateNonce();
      await session.save();
    }
    return session.nonce;
  }

  @Get("session")
  async getSessionData(
    @Session() session: Record<string, never>,
  ): Promise<object> {
    return { address: session.address, chainId: session.chainId };
  }

  @Get("logout")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async logout(@Session() session: Record<string, any>): Promise<void> {
    session.destroy();
  }

  @Post("verify")
  async verify(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Session() session: Record<string, any>,
    @Res() res: Response,
    @Body() body: VerifyMessageInput,
  ): Promise<void> {
    try {
      const provider = new AlchemyProvider(
        1,
        this.configService.get<string>("ALCHEMY_API_KEY"),
      );

      console.log("session:");
      console.log(session);
      const { message, signature } = body;
      const siweMessage = new SiweMessage(message);
      console.log("siweMessage:");
      console.log(siweMessage);
      const fields = await siweMessage.validate(signature, provider);
      console.log("fields:");
      console.log(fields);
      if (fields.nonce !== session.nonce) {
        throw new HttpException(
          "Invalid nonce.",
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      this.backendService.createSIWEUser(siweMessage.address);

      (session.token = this.authService.createToken(siweMessage.address)),
        (session.address = fields.address);
      session.chainId = fields.chainId;
      await session.save();

      res.status(HttpStatus.OK).end();
    } catch (error) {
      console.log(error);
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }
}
