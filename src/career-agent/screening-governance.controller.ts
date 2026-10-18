import { Body, Controller, Post, UseGuards, UsePipes, ValidationPipe } from "@nestjs/common";
import { PBACGuard } from "src/auth/pbac.guard";
import { Permissions, Session } from "src/shared/decorators";
import { CheckWalletPermissions } from "src/shared/constants";
import { SessionObject } from "src/shared/interfaces";
import { CandidateInvokeInput } from "./candidate-capabilities.dto";
import { ScreeningGovernanceService } from "./screening-governance.service";
import { ScreeningAuthorityOperation } from "./screening-governance.dto";

// No OAuth/worker controller forwards to this transport. Authority is taken exclusively
// from the PBAC-authenticated session and the canonical vacancy/organization seat.
@Controller("profile/screening-authority")
@UseGuards(PBACGuard)
@Permissions([CheckWalletPermissions.USER], [CheckWalletPermissions.ADMIN])
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class ScreeningGovernanceController {
  constructor(private readonly governance: ScreeningGovernanceService) {}

  @Post("invoke")
  async invoke(@Session() session: SessionObject, @Body() input: CandidateInvokeInput) {
    return { data: await this.governance.authorityInvoke(session, input.name as ScreeningAuthorityOperation, input.arguments) };
  }
}
