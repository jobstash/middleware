import { Body, Controller, Param, ParseUUIDPipe, Post, UseGuards, UsePipes } from "@nestjs/common";
import { IsIn, IsInt, IsOptional, IsUUID, Min } from "class-validator";
import { PBACGuard } from "src/auth/pbac.guard";
import { Permissions, Session } from "src/shared/decorators";
import { CheckWalletPermissions } from "src/shared/constants";
import { SessionObject } from "src/shared/interfaces";
import { CareerRepository } from "./career.repository";
import { CandidateSetupService } from "./candidate-setup.service";
import { ConnectionInputGuard, connectionInputValidation } from "./connection-input.guard";

class CompleteSetupInput {
  @IsIn(["document", "connection", "voice"])
  kind: "document" | "connection" | "voice";
  @IsUUID() id: string;
  @IsOptional() @IsInt() @Min(0) revision?: number;
}

@Controller("profile/candidate/setup")
@UseGuards(PBACGuard, ConnectionInputGuard)
@Permissions(CheckWalletPermissions.USER)
@UsePipes(connectionInputValidation)
export class CandidateSetupController {
  constructor(private readonly career: CareerRepository, private readonly setup: CandidateSetupService) {}

  @Post(":id/complete")
  async complete(@Session() session: SessionObject, @Param("id", ParseUUIDPipe) id: string, @Body() input: CompleteSetupInput) {
    return this.setup.complete({ kind: "session", owner: await this.career.owner(session.address), wallet: session.address }, id, input);
  }
}
