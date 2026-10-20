import { BadRequestException, Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards, UsePipes, ValidationPipe } from "@nestjs/common";
import { PBACGuard } from "src/auth/pbac.guard";
import { Permissions, Session } from "src/shared/decorators";
import { CheckWalletPermissions } from "src/shared/constants";
import { SessionObject } from "src/shared/interfaces";
import { ConnectionInputGuard } from "./connection-input.guard";
import { DeviceAuthGuard, DeviceRequest } from "./device-execution.guard";
import { DeviceExecutionService } from "./device-execution.service";
import { DeviceEventInput, DeviceLeaseInput, DevicePlatformInput, DeviceToolInput } from "./device-execution.dto";
import { CvShareInput, deviceInput } from "./device-execution.protocol";
import { AgentService } from "./agent.service";
import { CareerToolService } from "./career-tools.service";
import { CandidateDocumentsService } from "./candidate-documents.service";

@Controller("profile/devices")
@UseGuards(PBACGuard, ConnectionInputGuard)
@Permissions(CheckWalletPermissions.USER)
export class ProfileDevicesController {
  constructor(private readonly devices: DeviceExecutionService) {}
  @Get() list(@Session() session: SessionObject) { return this.devices.devices(session.address); }
  @Post("pair") pair(@Session() session: SessionObject, @Body() input: unknown) { return this.devices.pair(session.address, input); }
  @Post(":id/revoke") revoke(@Session() session: SessionObject, @Param("id", ParseUUIDPipe) id: string, @Body() input: unknown) {
    return this.devices.revoke(session.address, id, input);
  }
}

@Controller("device")
@UseGuards(DeviceAuthGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true,
  validationError: { target: false, value: false }, exceptionFactory: () => new BadRequestException("Invalid device input") }))
export class DeviceExecutionController {
  constructor(private readonly devices: DeviceExecutionService, private readonly agent: AgentService, private readonly tools: CareerToolService,
    private readonly documents: CandidateDocumentsService) {}
  @Header("Cache-Control", "private, no-store")
  @Post("platform") platform(@Req() request: DeviceRequest, @Body() input: DevicePlatformInput) {
    return this.devices.platform(request.device, input, (context, id) => this.documents.download(context, id));
  }
  /** Consented CV share approved natively in the companion; body bytes are signature-verified (7.5 MiB). */
  @Header("Cache-Control", "private, no-store")
  @HttpCode(200)
  @Post("cv") async cv(@Req() request: DeviceRequest, @Body() raw: unknown) {
    const input = deviceInput<CvShareInput>("cv", raw);
    const { context } = await this.devices.candidateContext(request.device);
    return this.documents.shareFromDevice(context, input);
  }
  @Post("activate") activate(@Req() request: DeviceRequest, @Body() input: unknown) { return this.devices.activate(request.device, input); }
  @Post("heartbeat") heartbeat(@Req() request: DeviceRequest, @Body() input: unknown) { return this.devices.heartbeat(request.device, input); }
  @Get("connections") connections(@Req() request: DeviceRequest) { return this.devices.connections(request.device); }
  @Post("connections") register(@Req() request: DeviceRequest, @Body() input: unknown) { return this.devices.registerConnection(request.device, input); }
  @Post("claim") async claim(@Req() request: DeviceRequest, @Body() raw: unknown) {
    const input = deviceInput("claim", raw);
    await this.devices.reconcile(request.device.owner);
    const task = await this.agent.claimDevice(request.device, input.connectionId, input.requestId) ??
      await this.devices.claim(request.device, input.connectionId, input.requestId);
    return { task };
  }
  @Post("tasks/:id/heartbeat") async taskHeartbeat(@Req() request: DeviceRequest, @Param("id", ParseUUIDPipe) id: string, @Body() input: DeviceLeaseInput) {
    if (!await this.devices.structuredHeartbeat(request.device, id, input.leaseId))
      await this.agent.deviceHeartbeat(request.device, id, input.leaseId);
    return { ok: true };
  }
  @Post("tasks/:id/result") result(@Req() request: DeviceRequest, @Param("id", ParseUUIDPipe) id: string, @Body() input: unknown) {
    return this.devices.result(request.device, id, input);
  }
  @Post("tasks/:id/events") async event(@Req() request: DeviceRequest, @Param("id", ParseUUIDPipe) id: string, @Body() input: DeviceEventInput) {
    if (!await this.devices.failure(request.device, id, input)) await this.agent.deviceEvent(request.device, id, { ...input });
    return { ok: true };
  }
  @Post("tasks/:id/tools") async tool(@Req() request: DeviceRequest, @Param("id", ParseUUIDPipe) id: string, @Body() input: DeviceToolInput) {
    await this.agent.assertDeviceLease(request.device, id, input.leaseId);
    if (input.method === "tools/call" && !input.name) throw new BadRequestException("Tool name required");
    if (Buffer.byteLength(JSON.stringify(input.arguments ?? {})) > 1024 * 1024) throw new BadRequestException("Tool arguments exceed limit");
    return this.tools.mcp(input.leaseId, id, { jsonrpc: "2.0", id: 1, method: input.method,
      params: input.method === "tools/call" ? { name: input.name, arguments: input.arguments } : undefined });
  }
}
