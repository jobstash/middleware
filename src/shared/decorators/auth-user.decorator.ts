import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { UserEntity } from "src/shared/entities/user.entity";

export const AuthUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): UserEntity => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
