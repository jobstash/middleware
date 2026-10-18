import {
  Body,
  Controller,
  Delete,
  Get,
  UseGuards,
  UsePipes,
} from "@nestjs/common";
import { PBACGuard } from "src/auth/pbac.guard";
import { CheckWalletPermissions } from "src/shared/constants";
import { Permissions, Session } from "src/shared/decorators";
import { SessionObject } from "src/shared/interfaces";
import { DisconnectVoiceInput } from "./voice-connection.dto";
import {
  ConnectionInputGuard,
  connectionInputValidation,
} from "./connection-input.guard";
import { VoiceConnectionService } from "./voice-connection.service";

@Controller("profile/voice/connection")
@UseGuards(PBACGuard)
@Permissions(CheckWalletPermissions.USER)
export class VoiceConnectionController {
  constructor(private readonly voice: VoiceConnectionService) {}

  @Get()
  connection(@Session() session: SessionObject) {
    return this.voice.connection(session.address);
  }

  @Delete()
  @UseGuards(ConnectionInputGuard)
  @UsePipes(connectionInputValidation)
  disconnect(
    @Session() session: SessionObject,
    @Body() input: DisconnectVoiceInput,
  ) {
    return this.voice.disconnect(session.address, input);
  }
}
