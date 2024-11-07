import { CustomDecorator, SetMetadata } from "@nestjs/common";
import { CheckWalletPermissions } from "../constants";

export const Permissions = (
  ...permissions:
    | (keyof typeof CheckWalletPermissions)[]
    | (keyof typeof CheckWalletPermissions)[][]
): CustomDecorator<string> => SetMetadata("permissions", permissions);
