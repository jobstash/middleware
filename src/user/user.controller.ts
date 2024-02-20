import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { UserService } from "./user.service";
import { Roles } from "src/shared/decorators";
import { RBACGuard } from "src/auth/rbac.guard";
import { CheckWalletFlows, CheckWalletRoles } from "src/shared/constants";
import { ResponseWithNoData, UserProfile } from "src/shared/interfaces";
import { ApproveOrgInput } from "./dto/approve-org.dto";

@Controller("users")
export class UserController {
  private logger = new CustomLogger(UserController.name);
  constructor(
    private readonly userService: UserService, // private readonly authService: AuthService,
  ) {}

  @Get("")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  async getAllUsers(): Promise<UserProfile[]> {
    this.logger.log("/users");
    return this.userService.findAll();
  }

  @Get("orgs/pending")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  async getOrgsAwaitingApproval(): Promise<UserProfile[]> {
    this.logger.log("/users/orgs/pending");
    return this.userService.getOrgsAwaitingApproval();
  }

  @Post("orgs/approve")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  async approveOrgApplication(
    @Body() body: ApproveOrgInput,
  ): Promise<ResponseWithNoData> {
    const { wallet } = body;
    const org = await this.userService.findByWallet(wallet);

    if (org) {
      this.logger.log(
        `/users/orgs/approve Approving org with wallet ${wallet}`,
      );
      await this.userService.setWalletFlow({
        flow: CheckWalletFlows.ORG_COMPLETE,
        wallet: wallet,
      });

      return {
        success: true,
        message: "Org approved successfully",
      };
    } else {
      return {
        success: false,
        message: "Org not found for that wallet",
      };
    }
  }
}
