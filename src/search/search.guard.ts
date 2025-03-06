import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";

@Injectable()
export class BlockScrapersGuard implements CanActivate {
  // Define your blacklisted IP addresses.
  private readonly blacklistedIPs: string[] = ["34.96.41.44"];

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // Check the user agent.
    const userAgent = request.headers["user-agent"];
    if (userAgent && userAgent.toLowerCase() === "node") {
      throw new ForbiddenException(
        "WTF are you doing man? 🤨 Reach out to @duckdegen and lets discuss",
      );
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
      throw new ForbiddenException(
        "WTF are you doing man? 🤨 Reach out to @duckdegen and lets discuss",
      );
    }

    return true;
  }
}
