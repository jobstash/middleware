import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { User } from "@privy-io/server-auth";

export const PrivySession = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): User => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
