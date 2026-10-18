import { Body, Controller, Get, Post, UseGuards, UsePipes, ValidationPipe } from "@nestjs/common";
import { PBACGuard } from "src/auth/pbac.guard";
import { Permissions, Session } from "src/shared/decorators";
import { CheckWalletPermissions } from "src/shared/constants";
import { SessionObject } from "src/shared/interfaces";
import { CareerRepository } from "./career.repository";
import { CandidateCapabilityService } from "./candidate-capabilities.service";
import { CandidateInvokeInput } from "./candidate-capabilities.dto";
import { CandidateInvocationContext } from "./candidate-context";

@Controller("profile/candidate")
@UseGuards(PBACGuard)
@Permissions(CheckWalletPermissions.USER)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class CandidateCapabilitiesController {
  constructor(private readonly career: CareerRepository, private readonly capabilities: CandidateCapabilityService) {}

  private async context(wallet: string): Promise<CandidateInvocationContext> {
    return { kind: "session", owner: await this.career.owner(wallet), wallet };
  }

  @Get("access")
  async access(@Session() { address }: SessionObject) {
    return this.capabilities.invoke(await this.context(address), "account_status", {});
  }

  @Get("capabilities")
  async catalog(@Session() { address }: SessionObject) {
    return this.capabilities.catalog(await this.context(address));
  }

  @Post("invoke")
  async invoke(@Session() { address }: SessionObject, @Body() input: CandidateInvokeInput) {
    return this.capabilities.invoke(await this.context(address), input.name, input.arguments);
  }
}
