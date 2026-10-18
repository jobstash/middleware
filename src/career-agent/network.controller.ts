import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { PBACGuard } from "src/auth/pbac.guard";
import { Permissions, Session } from "src/shared/decorators";
import { CheckWalletPermissions } from "src/shared/constants";
import { SessionObject } from "src/shared/interfaces";
import { ProfileService } from "src/auth/profile/profile.service";
import { CareerRepository } from "./career.repository";
import { createHash } from "node:crypto";
import { NetworkService } from "./network.service";
@Controller("profile/network")
@UseGuards(PBACGuard)
@Permissions(CheckWalletPermissions.USER)
export class NetworkController {
  constructor(
    private readonly network: NetworkService,
    private readonly career: CareerRepository,
    private readonly profile: ProfileService,
  ) {}
  @Post("scan") async scan(
    @Session() s: SessionObject,
    @Body() input: { stackId?: string; cursor?: string },
  ) {
    if (
      !input ||
      typeof input !== "object" ||
      Object.keys(input).some(k => !["stackId", "cursor"].includes(k)) ||
      typeof input.stackId !== "string" ||
      input.stackId.length > 128 ||
      (input.cursor !== undefined &&
        (typeof input.cursor !== "string" || input.cursor.length > 100))
    )
      throw new BadRequestException("Invalid scan input");
    const { owner, root } = await this.network.root(s.address);
    await this.career.requireAdvanced(owner);
    const { stacks } = await this.career.stacks(s.address);
    const stack = stacks.find(row => row.id === input.stackId);
    if (!stack) throw new NotFoundException("Stack not found");
    if (!root)
      return {
        verified: false,
        checked: 0,
        total: 0,
        nextCursor: null,
        unavailable: true,
        truncated: false,
      };
    const results = await this.profile.getRecommendedJobs(
      s.address,
      50,
      "web",
      1,
      undefined,
      { ...stack, intent: stack.intent === "network" ? "best" : stack.intent },
      true,
    );
    const ids = [
      ...new Set(
        results.jobs.flatMap(({ job }) =>
          job.organization?.orgId ? [job.organization.orgId] : [],
        ),
      ),
    ].sort();
    const version = createHash("sha256")
      .update(JSON.stringify([owner, root, stack, ids]))
      .digest("hex")
      .slice(0, 24);
    const match = input.cursor?.match(/^([a-f0-9]{24}):(\d+)$/);
    const offset = match?.[1] === version ? Number(match[2]) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > ids.length)
      throw new BadRequestException("Invalid scan cursor");
    const checks = await Promise.allSettled(
      ids
        .slice(offset, offset + 2)
        .map(id => this.network.paths(s.address, id)),
    );
    const checked = Math.min(offset + 2, ids.length);
    return {
      verified: true,
      checked,
      total: ids.length,
      nextCursor: checked < ids.length ? `${version}:${checked}` : null,
      unavailable: checks.some(
        r => r.status === "rejected" || r.value.available === null,
      ),
      truncated: checks.some(
        r => r.status === "fulfilled" && r.value.truncated === true,
      ),
    };
  }
  @Get(":id/annotations")
  @Permissions(CheckWalletPermissions.ADMIN)
  annotations(@Param("id") id: string) {
    return this.network.annotations(id);
  }
  @Get(":id/people") people(
    @Session() s: SessionObject,
    @Param("id") id: string,
  ) {
    return this.network.people(s.address, id);
  }
  @Get(":id/availability") availability(
    @Session() s: SessionObject,
    @Param("id") id: string,
  ): ReturnType<NetworkService["paths"]> {
    return this.network.paths(s.address, id);
  }
  @Get(":id/paths") paths(
    @Session() s: SessionObject,
    @Param("id") id: string,
  ): ReturnType<NetworkService["paths"]> {
    return this.network.paths(s.address, id, true);
  }
  @Get(":id/company") company(
    @Param("id") id: string,
  ): ReturnType<NetworkService["company"]> {
    return this.network.company(id);
  }
}
