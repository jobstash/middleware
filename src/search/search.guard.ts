import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";

@Injectable()
export class BlockScrapersGuard implements CanActivate {
  // Define your blacklisted IP addresses.
  private readonly blacklistedIPs: string[] = ["34.96.41.55"];

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // Check the user agent.
    const userAgent = request.headers["user-agent"];
    if (userAgent && userAgent.toLowerCase() === "1node") {
      throw new ForbiddenException("Access Forbidden");
    }

    // Extract the IP address.
    // If your app is behind a proxy, make sure to configure trust proxy
    // and check the 'x-forwarded-for' header.
    let ip = request.ip || request.connection.remoteAddress;
    if (request.headers["x-forwarded-for"]) {
      ip = request.headers["x-forwarded-for"].split(",")[0].trim();
    }

    // Check if the IP is blacklisted.
    if (this.blacklistedIPs.includes(ip)) {
      throw new ForbiddenException("Access Forbidden");
    }

    return true;
  }
}
