import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { Request } from "express";
import { PBACGuard } from "src/auth/pbac.guard";
import { Permissions, Session } from "src/shared/decorators";
import { CheckWalletPermissions } from "src/shared/constants";
import { SessionObject } from "src/shared/interfaces";
import { CandidateCancellationResult, CandidateCheckoutResult, CandidateWebhookResult, SubscriptionService } from "./subscription.service";
import { CandidateCheckoutInput, CandidateBillingMutationInput } from "./career.dto";
@Controller("profile/subscription")
@UseGuards(PBACGuard)
@Permissions(CheckWalletPermissions.USER)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class CandidateSubscriptionController {
  constructor(private readonly service: SubscriptionService) {}
  @Get() status(
    @Session() s: SessionObject,
  ): Promise<Record<string, unknown>> {
    return this.service.status(s.address);
  }
  @Post("checkout") checkout(
    @Session() s: SessionObject,
    @Body() input: CandidateCheckoutInput,
  ): Promise<CandidateCheckoutResult> {
    return this.service.checkout(s.address, input);
  }
  @Post("cancel") cancel(
    @Session() s: SessionObject,
    @Body() input: CandidateBillingMutationInput,
  ): Promise<CandidateCancellationResult> {
    return this.service.cancel(s.address, input);
  }
}
@Controller("webhooks/candidate-stripe")
export class CandidateStripeWebhookController {
  constructor(private readonly service: SubscriptionService) {}
  @Post() @HttpCode(200) webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers("stripe-signature") signature: string,
  ): Promise<CandidateWebhookResult> {
    return this.service.webhook(req.rawBody, signature);
  }
}
