import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
} from "@nestjs/common";
import { ApiInternalServerErrorResponse, ApiOkResponse } from "@nestjs/swagger";
import { User } from "src/shared/types";
import { CreateSIWEUserInput } from "../dto/create-siwe-user.input";
import { VerifyMessageInput } from "../dto/verify-message.input";
import { SiweService } from "./siwe.service";

@Controller("siwe")
export class SiweController {
  constructor(private readonly siweService: SiweService) {}

  @Get("nonce")
  @ApiOkResponse({
    description: "A nonce generated for the SIWE process on the client-side",
  })
  @ApiInternalServerErrorResponse({
    description: "Something went wrong generating the nonce",
  })
  async getNonce(): Promise<string> {
    return this.siweService.getNonce();
  }

  @Post("verify")
  @ApiOkResponse({
    description:
      "True or false depending on the validity of the message passed",
  })
  @ApiInternalServerErrorResponse({
    description: "Something went wrong verifying the message",
  })
  async verifyMessage(@Body() body: VerifyMessageInput): Promise<boolean> {
    return this.siweService.verifyMessage(body);
  }

  @Post("create/user")
  @ApiOkResponse({
    description: "The user has been created successfully",
  })
  @ApiInternalServerErrorResponse({
    description: "Something went wrong creating the new user",
  })
  async createUser(
    @Body() body: CreateSIWEUserInput,
  ): Promise<User | undefined> {
    if (body.chainId !== 1) {
      throw new BadRequestException({
        statusCode: 400,
        message: ["You must sign in on an Ethereum Wallet!"],
        error: "Chain ID must be equal to 1",
      });
    } else {
      return this.siweService.createSIWEUser(body);
    }
  }
}
