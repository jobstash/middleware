import { Controller, Get, UseGuards } from "@nestjs/common";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { UserService } from "./user.service";
import { Roles } from "src/shared/decorators";
import { RBACGuard } from "src/auth/rbac.guard";
import { CheckWalletRoles } from "src/shared/constants";
import { UserProfile } from "src/shared/interfaces";

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
}
