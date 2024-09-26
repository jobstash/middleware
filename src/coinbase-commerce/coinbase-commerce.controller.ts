import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { Request } from "express";

@Controller("coinbase-commerce")
export class CoinbaseCommerceController {
  @Post("webhook")
  async handleWebhook(@Req() req: Request): Promise<void> {
    console.log(req);
  }
}
