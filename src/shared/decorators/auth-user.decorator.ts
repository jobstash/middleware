import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { UserEntity } from "src/shared/types";

export const AuthUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): UserEntity => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
