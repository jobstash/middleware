import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { CACHE_CONTROL_HEADER, CACHE_EXPIRY, NO_CACHE } from "../constants";
import { CustomLogger } from "../utils/custom-logger";
import * as etag from "etag";

type CachePolicy =
  | { mode: "ttl"; seconds: number }
  | { mode: "revalidate-always" }
  | { mode: "no-store" };

@Injectable()
export class CacheHeaderInterceptor implements NestInterceptor {
  private readonly logger = new CustomLogger(CacheHeaderInterceptor.name);
  private readonly policy: CachePolicy;
  constructor(
    policyOrDuration: CachePolicy | number,
    private readonly vary?: string[],
  ) {
    this.policy =
      typeof policyOrDuration === "number"
        ? { mode: "ttl", seconds: policyOrDuration }
        : policyOrDuration;
  }

  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    return next.handle().pipe(
      tap((data: unknown) => {
        const http = context.switchToHttp();
        const res = http.getResponse();

        const etagValue = etag(JSON.stringify(data) ?? "{}");

        if (this.policy.mode === "ttl") {
          const expiry = CACHE_EXPIRY(this.policy.seconds);
          this.logger.log(
            `Setting cache headers (ttl=${this.policy.seconds}s) for ${context.getClass().name}::${context.getHandler().name} with expiry ${expiry}, etag ${etagValue}`,
          );
          res.setHeader(
            "Cache-Control",
            CACHE_CONTROL_HEADER(this.policy.seconds),
          );
          res.setHeader("Expires", expiry);
        } else if (this.policy.mode === "revalidate-always") {
          this.logger.log(
            `Setting cache headers (revalidate-always) for ${context.getClass().name}::${context.getHandler().name} with etag ${etagValue}`,
          );
          // Force shared caches to revalidate on every request
          res.setHeader(
            "Cache-Control",
            "public, max-age=0, s-maxage=0, must-revalidate",
          );
          res.removeHeader("Expires");
        } else if (this.policy.mode === "no-store") {
          this.logger.log(
            `Setting cache headers (no-store) for ${context.getClass().name}::${context.getHandler().name}`,
          );
          res.setHeader("Cache-Control", NO_CACHE);
          res.removeHeader("Expires");
        }

        if (this.vary?.length) {
          res.setHeader("Vary", this.vary.join(", "));
        }
        res.setHeader("Etag", etagValue);
      }),
    );
  }
}
