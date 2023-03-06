import { Injectable } from "@nestjs/common";
import { generateNonce, SiweMessage } from "siwe";
import { VerifyMessageDto } from "../dto/verify-message.input";

@Injectable()
export class SiweService {
  async getNonce(): Promise<string> {
    return Promise.resolve(generateNonce());
  }

  async verifyMessage(input: VerifyMessageDto): Promise<boolean> {
    const { message, signature } = input;
    const siweMessage = new SiweMessage(message);
    try {
      await siweMessage.validate(signature);
      return true;
    } catch {
      return false;
    }
  }
}
