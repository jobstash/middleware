import {
  Injectable,
  Controller,
  Get,
  Post,
  Body,
  Query,
  Header,
  UseGuards,
  ValidationPipe,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsIP,
  IsBoolean,
  IsIn,
  IsInt,
  Min,
  Max,
  Matches,
} from "class-validator";
import { createHash, timingSafeEqual } from "node:crypto";
import { PBACGuard } from "src/auth/pbac.guard";
import { Permissions, Session } from "src/shared/decorators";
import { CheckWalletPermissions } from "src/shared/constants";
import { SessionObject } from "src/shared/interfaces";
import { PostgresService } from "src/postgres/postgres.service";
export class BlockIpInput {
  @IsIP() @Matches(/^[0-9a-fA-F:.]+$/) ip!: string;
  @IsBoolean() blocked!: boolean;
}
export class BlockIpQuery {
  @Type(() => Number) @IsInt() @Min(0) offset = 0;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
  @IsIn(["ip", "changedAt", "changedBy"]) sort = "changedAt";
  @IsIn(["asc", "desc"]) direction = "desc";
}
export class BlockProxyAck {
  @Matches(/^[a-f0-9]{64}$/) revision!: string;
}
export function blockRevision(ips: string[]): string {
  return createHash("sha256").update(JSON.stringify(ips)).digest("hex");
}
@Injectable()
export class BlockProxyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.VISITOR_BLOCKLIST_SECRET;
    const supplied = context.switchToHttp().getRequest().headers[
      "x-blocklist-key"
    ];
    if (
      !expected ||
      expected.length < 32 ||
      typeof supplied !== "string" ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    )
      throw new UnauthorizedException();
    return true;
  }
}
@Injectable()
export class VisitorIpBlocksService {
  constructor(private readonly postgres: PostgresService) {}
  async snapshot(): Promise<{
    ips: string[];
    revision: string;
    applied: boolean;
    checkedAt: string | null;
  }> {
    const [row] = await this.postgres
      .query(`SELECT COALESCE((SELECT jsonb_agg(host(ip) ORDER BY ip) FROM visitor_ip_blocks WHERE blocked),'[]'::jsonb) AS ips,
   (SELECT revision FROM visitor_ip_block_proxy_state WHERE singleton) AS revision,
   (SELECT checked_at FROM visitor_ip_block_proxy_state WHERE singleton) AS checked_at`);
    const ips = row.ips as string[];
    const revision = blockRevision(ips);
    return {
      ips,
      revision,
      applied:
        row.revision === revision &&
        !!row.checked_at &&
        Date.now() - new Date(String(row.checked_at)).getTime() < 30000,
      checkedAt: row.checked_at
        ? new Date(String(row.checked_at)).toISOString()
        : null,
    };
  }
  async list(input: BlockIpQuery): Promise<unknown> {
    const order =
      {
        ip: "visitor_ip_blocks.ip",
        changedAt: "changed_at",
        changedBy: "changed_by",
      }[input.sort] ?? "changed_at";
    const direction = input.direction === "asc" ? "ASC" : "DESC";
    const [row] = await this.postgres.query(
      `WITH page AS (SELECT host(ip) AS ip,changed_at AS "changedAt",changed_by AS "changedBy" FROM visitor_ip_blocks WHERE blocked ORDER BY ${order} ${direction},ip LIMIT $1 OFFSET $2)
  SELECT (SELECT count(*)::int FROM visitor_ip_blocks WHERE blocked) AS total,COALESCE((SELECT jsonb_agg(page) FROM page),'[]'::jsonb) AS rows`,
      [input.limit, input.offset],
    );
    return { ...row, ...(await this.snapshot()) };
  }
  async set(input: BlockIpInput, actor: string): Promise<unknown> {
    if (!process.env.VISITOR_BLOCKLIST_SECRET)
      throw new ServiceUnavailableException("IP blocking is not configured");
    await this.postgres.query(
      `WITH changed AS (
   INSERT INTO visitor_ip_blocks(ip,blocked,changed_by) VALUES($1::inet,$2,$3)
   ON CONFLICT(ip) DO UPDATE SET blocked=EXCLUDED.blocked,changed_at=now(),changed_by=EXCLUDED.changed_by
   WHERE visitor_ip_blocks.blocked IS DISTINCT FROM EXCLUDED.blocked
   RETURNING ip,blocked,changed_by
  ) INSERT INTO visitor_ip_block_history(ip,blocked,changed_by) SELECT ip,blocked,changed_by FROM changed`,
      [input.ip, input.blocked, actor],
    );
    return this.snapshot();
  }
  async ack(revision: string): Promise<void> {
    // A delayed acknowledgement never marks a newer list as applied.
    await this.postgres.query(
      `INSERT INTO visitor_ip_block_proxy_state(singleton,revision) VALUES(true,$1)
   ON CONFLICT(singleton) DO UPDATE SET revision=EXCLUDED.revision,checked_at=now()`,
      [revision],
    );
  }
}
const validation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
@Controller("telemetry/ip-blocks")
export class VisitorIpBlocksController {
  constructor(private readonly blocks: VisitorIpBlocksService) {}
  @Get()
  @Header("Cache-Control", "private, no-store")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  async list(@Query(validation) input: BlockIpQuery): Promise<unknown> {
    return { success: true, data: await this.blocks.list(input) };
  }
  @Post()
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  async set(
    @Body(validation) input: BlockIpInput,
    @Session() session: SessionObject,
  ): Promise<unknown> {
    return {
      success: true,
      data: await this.blocks.set(input, session.address),
    };
  }
  @Get("proxy")
  @Header("Cache-Control", "private, no-store")
  @UseGuards(BlockProxyGuard)
  async proxy(): Promise<unknown> {
    return this.blocks.snapshot();
  }
  @Post("proxy/ack")
  @UseGuards(BlockProxyGuard)
  async ack(@Body(validation) input: BlockProxyAck): Promise<unknown> {
    await this.blocks.ack(input.revision);
    return { success: true };
  }
}
