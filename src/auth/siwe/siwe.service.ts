import { Injectable } from "@nestjs/common";
import { generateNonce, SiweMessage } from "siwe";
import { BackendService } from "src/backend/backend.service";
import { User } from "src/shared/types";
import { CreateSIWEUserInput } from "../dto/create-siwe-user.input";
import { VerifyMessageInput } from "../dto/verify-message.input";

@Injectable()
export class SiweService {
  constructor(private readonly backendService: BackendService) {}

  async getNonce(): Promise<string> {
    return Promise.resolve(generateNonce());
  }

  async verifyMessage(input: VerifyMessageInput): Promise<boolean> {
    const { message, signature } = input;
    const siweMessage = new SiweMessage(message);
    try {
      await siweMessage.validate(signature);
      return true;
    } catch {
      return false;
    }
  }

  async createSIWEUser(input: CreateSIWEUserInput): Promise<User | undefined> {
    return this.backendService.createSIWEUser(input);
  }
}
