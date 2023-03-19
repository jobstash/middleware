import { Injectable } from "@nestjs/common";
import { generateNonce, SiweMessage } from "siwe";
import { BackendService } from "src/backend/backend.service";
import { ResponseWithNoData } from "src/shared/types";
import { AuthService } from "../auth.service";
import { VerifyMessageInput } from "../dto/verify-message.input";

@Injectable()
export class SiweService {
  constructor(
    private readonly backendService: BackendService,
    private readonly authService: AuthService,
  ) {}

  async getNonce(): Promise<string> {
    return Promise.resolve(generateNonce());
  }

  async verifyMessage(input: VerifyMessageInput): Promise<ResponseWithNoData> {
    const { message, signature } = input;
    const siweMessage = new SiweMessage(message);
    try {
      await siweMessage.validate(signature);
      if (siweMessage.chainId === 1) {
        this.backendService.createSIWEUser(siweMessage.address);
        return {
          success: true,
          message: this.authService.createToken(siweMessage.address),
        };
      } else {
        return {
          success: false,
          message: "Please sign in with an Ethereum wallet",
        };
      }
    } catch {
      return { success: false, message: "Invalid Message!" };
    }
  }
}
