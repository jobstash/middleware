import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { SessionObject } from "../interfaces";

export const Session = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): SessionObject => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException("User not found");
    }
    return user;
  },
);
