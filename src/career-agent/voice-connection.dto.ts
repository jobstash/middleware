import { IsUUID } from "class-validator";
import { MutationInput } from "./career.dto";

/** Signed device session reservation. Provider credentials and SDP stay local. */
export class CreateDeviceVoiceInput {
  @IsUUID() requestId: string;
  @IsUUID() sessionId: string;
  @IsUUID() connectionId: string;
}

export class DisconnectVoiceInput extends MutationInput {
  @IsUUID() connectionId: string;
}
