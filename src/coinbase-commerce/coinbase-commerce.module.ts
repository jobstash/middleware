import { Module } from "@nestjs/common";
import { CoinbaseCommerceController } from "./coinbase-commerce.controller";
import { CoinbaseCommerceService } from "./coinbase-commerce.service";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule, ConfigService } from "@nestjs/config";

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        headers: {
          "Content-Type": "application/json",
          "X-CC-Api-Key": configService.get<string>("CC_API_KEY"),
        },
        baseURL: "https://api.commerce.coinbase.com/",
      }),
    }),
  ],
  controllers: [CoinbaseCommerceController],
  providers: [CoinbaseCommerceService],
  exports: [CoinbaseCommerceService],
})
export class CoinbaseCommerceModule {}
