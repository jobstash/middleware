import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { firstValueFrom } from "rxjs";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { CreateCharge } from "./dto/create-charge.dto";
import { Charge } from "./dto/charge.dto";
import { AxiosError } from "axios";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class PaymentsService {
  private logger = new CustomLogger(PaymentsService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async createCharge(chargeData: CreateCharge): Promise<{
    id: string;
    url: string;
  }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<{ data: Charge }>("charges", chargeData),
      );
      const data = response.data;
      return {
        id: data.data.id,
        url: data.data.hosted_url,
      };
    } catch (error) {
      if (error instanceof AxiosError) {
        this.logger.error(
          `Failed to create charge: ${JSON.stringify(error, null, 4)}`,
        );
      } else {
        this.logger.error(`Failed to create charge: ${error.message}`);
      }
      throw error;
    }
  }

  async verifyWebhookSignature(
    body: string,
    signature: string,
  ): Promise<boolean> {
    const { createHmac } = await import("node:crypto");
    const hmac = createHmac(
      "sha256",
      this.configService.get<string>("LLAMA_PAY_WEBHOOK_KEY"),
    );
    hmac.update(body);
    const computedSignature = hmac.digest("hex");
    return computedSignature === signature;
  }
}
