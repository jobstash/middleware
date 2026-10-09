import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { PBACGuard } from "src/auth/pbac.guard";
import { Permissions, Session } from "src/shared/decorators";
import { CheckWalletPermissions } from "src/shared/constants";
import { SessionObject } from "src/shared/interfaces";
import { DeviceAuthGuard, DeviceRequest } from "./device-execution.guard";
import {
  DeviceExecutionService,
  DeviceRecord,
  DevicePairing,
  DeviceRevocation,
  DeviceActivation,
  DeviceHeartbeat,
} from "./device-execution.service";
import { SubscriptionService, MembershipStatus } from "./subscription.service";

@Controller("profile")
@UseGuards(PBACGuard)
@Permissions(CheckWalletPermissions.USER)
export class CompanionProfileController {
  constructor(
    private readonly devices: DeviceExecutionService,
    private readonly subscriptions: SubscriptionService,
  ) {}
  @Get("devices")
  devicesList(@Session() { address }: SessionObject): Promise<DeviceRecord[]> {
    return this.devices.devices(address);
  }
  @Post("devices/pair")
  @HttpCode(200)
  pair(
    @Session() { address }: SessionObject,
    @Body() body: unknown,
  ): Promise<DevicePairing> {
    return this.devices.pair(address, body);
  }
  @Post("devices/:id/revoke")
  @HttpCode(200)
  revoke(
    @Session() { address }: SessionObject,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<DeviceRevocation> {
    return this.devices.revoke(address, id, body);
  }
  @Get("subscription")
  status(@Session() { address }: SessionObject): Promise<MembershipStatus> {
    return this.subscriptions.status(address);
  }
  @Post("subscription/checkout")
  @HttpCode(200)
  checkout(
    @Session() { address }: SessionObject,
    @Body() body: unknown,
  ): Promise<{ checkoutUrl: string }> {
    return this.subscriptions.checkout(address, body);
  }
}

@Controller("device")
@UseGuards(DeviceAuthGuard)
export class CompanionDeviceController {
  constructor(private readonly devices: DeviceExecutionService) {}
  @Post("activate")
  @HttpCode(200)
  activate(
    @Req() request: DeviceRequest,
    @Body() body: unknown,
  ): Promise<DeviceActivation> {
    return this.devices.activate(request.device, body);
  }
  @Post("heartbeat")
  @HttpCode(200)
  heartbeat(
    @Req() request: DeviceRequest,
    @Body() body: unknown,
  ): Promise<DeviceHeartbeat> {
    return this.devices.heartbeat(request.device, body);
  }
  @Post("platform")
  @HttpCode(200)
  platform(
    @Req() request: DeviceRequest,
    @Body() body: unknown,
  ): Promise<unknown> {
    return this.devices.platform(request.device, body);
  }
}
