import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { SessionObject } from "../interfaces";

export const Session = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): SessionObject => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
