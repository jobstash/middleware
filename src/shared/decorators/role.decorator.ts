import { CustomDecorator, SetMetadata } from "@nestjs/common";

export const Permissions = (
  ...permissions: string[]
): CustomDecorator<string> => SetMetadata("permissions", permissions);
