import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { CACHE_CONTROL_HEADER, CACHE_EXPIRY } from "../constants";
import { CustomLogger } from "../utils/custom-logger";
import * as etag from "etag";

@Injectable()
export class CacheHeaderInterceptor implements NestInterceptor {
  private readonly logger = new CustomLogger(CacheHeaderInterceptor.name);
  constructor(private readonly duration: number) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    return next.handle().pipe(
      tap((data: unknown) => {
        const http = context.switchToHttp();
        const res = http.getResponse();

        const expiry = CACHE_EXPIRY(this.duration);
        const etagValue = etag(JSON.stringify(data));

        this.logger.log(
          `Setting cache headers for ${context.getClass().name}::${context.getHandler().name} with expiry ${expiry}, etag ${etagValue}`,
        );

        res.setHeader("Cache-Control", CACHE_CONTROL_HEADER(this.duration));
        res.setHeader("Expires", expiry);
        res.setHeader("Etag", etagValue);
      }),
    );
  }
}
