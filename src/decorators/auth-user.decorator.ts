import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { User } from "src/auth/user/user.entity";

export const AuthUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
