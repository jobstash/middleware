import { Controller, Post, Body, UseGuards } from "@nestjs/common";
import { AssignRoleAndFlowToUserRequestDto } from "./dto/assign-role-and-flow-to-user.dto";
import { UserService } from "./user.service";

import { ApiBearerAuth } from "@nestjs/swagger";
import { WalletAdminMappingDto } from "./dto/wallet-admin-mapping-request.dto";
import {
  ResponseWithNoData,
  Response,
} from "../../shared/interfaces/response.interface";
import { USER_ROLES, USER_FLOWS } from "../../shared/constants";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { RBACGuard } from "../rbac.guard";
import { CheckWalletRoles } from "src/shared/enums";
import { Roles } from "src/shared/decorators/role.decorator";

@ApiBearerAuth()
@Controller("user")
export class UserController {
  private readonly logger = new CustomLogger(UserController.name);

  constructor(private readonly userService: UserService) {}

  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @Post("set-admin-role")
  async setAdminRole(
    @Body() walletDto: WalletAdminMappingDto,
  ): Promise<ResponseWithNoData> {
    const { wallet } = walletDto;
    this.logger.log(
      `/user/setAdminrole: Setting admin priviledges for ${wallet}`,
    );
    const user = await this.userService.findByWallet(wallet);

    this.userService.setRole(USER_ROLES.ADMIN, user);
    this.userService.setRole(USER_FLOWS.ADMIN_COMPLETE, user);

    this.logger.log(`admin priviliedges set.`);
    return { success: true, message: "Wallet is now admin" };
  }

  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  @Post("assign-role-and-flow-to-wallet")
  async assignRoleAndFlowToWallet(
    @Body() wallerFlowRole: AssignRoleAndFlowToUserRequestDto,
  ): Promise<Response<string> | ResponseWithNoData> {
    const { wallet, role, flow } = wallerFlowRole;
    this.logger.log(
      `/user/assignRoleAndFlowToWallet: Assigning ${role} role and ${flow} flow to wallet ${wallet}`,
    );
    if (!wallet) {
      return { success: false, message: "Wallet not passed" };
    }

    const storedUser = await this.userService.findByWallet(wallet);

    if (!storedUser) {
      return { success: false, message: "User not found" };
    }

    if (!role) {
      return { success: false, message: "Desired role not passed" };
    }

    if (!flow) {
      return { success: false, message: "Desired flow not passed" };
    }

    await this.userService.setFlow(flow, storedUser);
    await this.userService.setRole(role, storedUser);

    return {
      success: true,
      message: "User updated",
      data: JSON.stringify(storedUser.getProperties()),
    };
  }
}
