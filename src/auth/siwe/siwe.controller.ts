import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiInternalServerErrorResponse, ApiOkResponse } from "@nestjs/swagger";
import { VerifyMessageDto } from "../dto/verify-message.input";
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
  async verifyMessage(@Body() body: VerifyMessageDto): Promise<boolean> {
    return this.siweService.verifyMessage(body);
  }
}
