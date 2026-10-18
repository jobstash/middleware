import type { Response } from "express";
import {
  Body,
  Res,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { PBACGuard } from "src/auth/pbac.guard";
import { Permissions, Session } from "src/shared/decorators";
import { CheckWalletPermissions } from "src/shared/constants";
import { SessionObject } from "src/shared/interfaces";
import { AgentService, ConnectionModels } from "./agent.service";
import {
  PromptInput,
  SelectConnectionModelInput,
  SessionInput,
} from "./agent.dto";
import { MutationInput } from "./career.dto";
@Controller("profile")
@UseGuards(PBACGuard)
@Permissions(CheckWalletPermissions.USER)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class AgentController {
  constructor(private readonly agent: AgentService) {}
  @Get("ai-connections") connections(
    @Session() s: SessionObject,
  ): ReturnType<AgentService["connections"]> {
    return this.agent.connections(s.address);
  }
  @Get("ai-connections/:id/models") connectionModels(
    @Session() s: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ConnectionModels> {
    return this.agent.connectionModels(s.address, id);
  }
  @Post("ai-connections/:id/model") selectConnectionModel(
    @Session() s: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: SelectConnectionModelInput,
  ): Promise<ConnectionModels> {
    return this.agent.selectConnectionModel(s.address, id, input);
  }
  @Post("ai-connections/:id/disconnect") disconnect(
    @Session() s: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: MutationInput,
  ): ReturnType<AgentService["disconnect"]> {
    return this.agent.disconnect(s.address, id, input);
  }
  @Get("agent/sessions") sessions(
    @Session() s: SessionObject,
  ): ReturnType<AgentService["sessions"]> {
    return this.agent.sessions(s.address);
  }
  @Post("agent/sessions") session(
    @Session() s: SessionObject,
    @Body() input: SessionInput,
  ): ReturnType<AgentService["session"]> {
    return this.agent.session(s.address, input);
  }
  @Post("agent/sessions/:id/prompts") prompt(
    @Session() s: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: PromptInput,
  ): ReturnType<AgentService["prompt"]> {
    return this.agent.prompt(s.address, id, input);
  }
  @Get("agent/requests/:id/events") events(
    @Session() s: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
  ): ReturnType<AgentService["events"]> {
    return this.agent.events(s.address, id);
  }
  @Get("agent/sessions/:id/conversation") conversation(
    @Session() s: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
  ): ReturnType<AgentService["conversation"]> {
    return this.agent.conversation(s.address, id);
  }
  @Get("agent/requests/:id/stream") async stream(
    @Session() s: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    let snapshot = await this.agent.events(s.address, id); // Ownership before any headers.
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "private, no-cache, no-transform",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    let closed = false;
    const sent = new Set<string>();
    res.on("close", () => {
      closed = true;
    });
    const started = Date.now();
    while (!closed && Date.now() - started < 650000) {
      for (const row of snapshot.events as { id: string; event: unknown }[]) {
        if (sent.has(String(row.id))) continue;
        sent.add(String(row.id));
        res.write(`id: ${row.id}\ndata: ${JSON.stringify(row)}\n\n`);
      }
      res.write(
        `event: status\ndata: ${JSON.stringify({ status: snapshot.status })}\n\n`,
      );
      if (!["queued", "waiting_for_device", "running"].includes(String(snapshot.status))) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (closed) break;
      try {
        snapshot = await this.agent.events(s.address, id);
      } catch {
        break;
      }
    }
    if (!res.writableEnded) res.end();
  }
  @Post("agent/requests/:id/cancel") cancel(
    @Session() s: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: MutationInput,
  ): ReturnType<AgentService["cancel"]> {
    return this.agent.cancel(s.address, id, input);
  }
}
