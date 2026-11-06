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

  canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const httpContext = context.switchToHttp();
      const req = httpContext.getRequest<Request>();
      const hasPermission =
        req.headers["authorization"]?.replace("Bearer ", "") === this.apiKey;
      if (hasPermission) return Promise.resolve(true);
      throw new ForbiddenException({
        success: false,
        message: "Forbidden resource: Insufficient permissions",
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }
}
