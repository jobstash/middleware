// siwe.controller.ts
import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  HttpStatus,
  HttpException,
  Body,
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
  private readonly sessionConfig: IronSessionOptions;
  constructor(
    private readonly configService: ConfigService,
    private readonly backendService: BackendService,
    private readonly authService: AuthService,
  ) {
    this.sessionConfig = {
      cookieName:
        configService.get<string>("COOKIE_NAME") || "connectkit-next-siwe",
      password: configService.get<string>("SESSION_SECRET"),
      cookieOptions: {
        secure: configService.get<string>("NODE_ENV") === "production",
      },
    };
  }

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
  async getNonce(@Req() req: Request, @Res() res: Response): Promise<void> {
    const session = await this.getSession(req, res, this.sessionConfig);
    if (!session.nonce) {
      session.nonce = generateNonce();
      await session.save();
    }
    res.send(session.nonce);
  }

  @Get("session")
  async getSessionData(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { address, chainId } = await this.getSession(
      req,
      res,
      this.sessionConfig,
    );
    res.send({ address, chainId });
  }

  @Get("logout")
  async logout(@Req() req: Request, @Res() res: Response): Promise<void> {
    const session = await this.getSession(req, res, this.sessionConfig);
    session.destroy();
    res.status(HttpStatus.OK).end();
  }

  @Post("verify")
  async verify(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: VerifyMessageInput,
  ): Promise<void> {
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
