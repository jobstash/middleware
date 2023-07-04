import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly apiKey: string;
  constructor(private readonly configService: ConfigService) {
    this.apiKey = configService.get<string>("VCDATA_API_KEY");
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest<Request>();

    const hasPermission =
      req.headers["authorization"]?.split(" ")[1] === this.apiKey;

    if (hasPermission) {
      return true;
    } else {
      throw new ForbiddenException({
        success: false,
        message: "Forbidden resource: Insufficient permissions",
      });
    }
  }
}
