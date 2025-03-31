import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
import { Response as ExpressResponse, Request } from "express";
import { Session } from "src/shared/decorators/session.decorator";
import {
  Response,
  ResponseWithNoData,
  SessionObject,
  UserProfile,
  data,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { UserService } from "../user/user.service";
import { AuthService } from "./auth.service";
import { SendVerificationEmailInput } from "./dto/send-verification-email.input";
import { MagicAuthStrategy } from "./magic/magic.strategy";
import { ProfileService } from "./profile/profile.service";
import { PBACGuard } from "./pbac.guard";
import { responseSchemaWrapper } from "src/shared/helpers";
import { isEmail } from "validator";

@Controller("auth")
export class AuthController {
  private logger = new CustomLogger(AuthController.name);
  constructor(
    private readonly userService: UserService,
    private readonly profileService: ProfileService,
    private readonly authService: AuthService,
    private strategy: MagicAuthStrategy,
  ) {}

  @Post("magic/login")
  @UseGuards(PBACGuard)
  @ApiOkResponse({
    description: "Generates and sends email verification link for devs",
    schema: { $ref: getSchemaPath(ResponseWithNoData) },
  })
  async sendDevMagicLink(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body(new ValidationPipe({ transform: true }))
    body: SendVerificationEmailInput,
  ): Promise<ResponseWithNoData> {
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      const result = await this.userService.addUserEmail(
        address,
        body.destination,
      );
      if (result.success) {
        this.strategy.send(req, res);
        return {
          success: result.success,
          message: result.message,
        };
      } else {
        res.status(HttpStatus.BAD_REQUEST);
        return result;
      }
    } else {
      res.status(HttpStatus.BAD_REQUEST);
      return {
        success: false,
        message: "Bad Request",
      };
    }
  }

  @Get("magic/login/callback")
  @UseGuards(AuthGuard("dev-magic"))
  @ApiOkResponse({
    description: "Callback for email verification link for devs",
    schema: { $ref: getSchemaPath(ResponseWithNoData) },
  })
  async verifyDevMagicLink(
    @Session() session: SessionObject,
  ): Promise<Response<UserProfile>> {
    const profile = data(
      await this.profileService.getUserProfile(session.address),
    );

    await this.profileService.getUserWorkHistory(session.address);

    return {
      success: true,
      message: "Signed in with email successfully",
      data: profile,
    };
  }

  @Post("update-main-email")
  @UseGuards(PBACGuard)
  @ApiOkResponse({
    description: "Updates a users primary email",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async updateUserMainEmail(
    @Query("email") email: string,
    @Session() session: SessionObject,
    @Res({ passthrough: true }) res: ExpressResponse,
  ): Promise<ResponseWithNoData> {
    if (isEmail(email)) {
      this.logger.log(`/user/update-email`);
      const { address } = session;
      if (address) {
        const result = await this.userService.updateUserMainEmail(
          address as string,
          email,
        );
        if (result.success) {
          return {
            success: result.success,
            message: result.message,
          };
        } else {
          res.status(HttpStatus.BAD_REQUEST);
          return result;
        }
      } else {
        res.status(HttpStatus.BAD_REQUEST);
        return {
          success: false,
          message: "Bad Request",
        };
      }
    } else {
      res.status(HttpStatus.BAD_REQUEST);
      return {
        success: false,
        message: "Bad Request",
      };
    }
  }

  @Delete("remove-email")
  @UseGuards(PBACGuard)
  @ApiOkResponse({
    description: "Removes an email from a user's profile",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async removeUserEmail(
    @Query("email") email: string,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Session() session: SessionObject,
  ): Promise<ResponseWithNoData> {
    if (isEmail(email)) {
      this.logger.log(`/user/remove-email`);
      const { address } = session;
      if (address) {
        const result = await this.userService.removeUserEmail(
          address as string,
          email,
        );
        if (result.success) {
          return {
            success: result.success,
            message: result.message,
          };
        } else {
          res.status(HttpStatus.BAD_REQUEST);
          return result;
        }
      } else {
        res.status(HttpStatus.BAD_REQUEST);
        return {
          success: false,
          message: "Bad Request",
        };
      }
    } else {
      res.status(HttpStatus.BAD_REQUEST);
      return {
        success: false,
        message: "Bad Request",
      };
    }
  }
}
