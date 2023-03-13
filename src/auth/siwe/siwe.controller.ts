import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
} from "@nestjs/swagger";
import { ResponseEntity } from "src/shared/entities";
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
    description: "An object containing the auth token for the created user",
  })
  @ApiBadRequestResponse({
    description: "Something went wrong verifying the message",
  })
  async verifyMessage(
    @Body() body: VerifyMessageInput,
  ): Promise<ResponseEntity> {
    const res = await this.siweService.verifyMessage(body);
    if (res.success) {
      return res;
    } else {
      throw new BadRequestException(res);
    }
  }
}
