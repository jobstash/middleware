import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { firstValueFrom } from "rxjs";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { CreateCharge } from "./dto/create-charge.dto";
import { Charge } from "./dto/charge.dto";
import { AxiosError } from "axios";

@Injectable()
export class CoinbaseCommerceService {
  private logger = new CustomLogger(CoinbaseCommerceService.name);

  constructor(private readonly httpService: HttpService) {}

  async createCharge(chargeData: CreateCharge): Promise<Charge> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<Charge>("charges", chargeData),
      );
      return response.data;
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
}
