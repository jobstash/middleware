import { LinkedAccountWithMetadata, User } from "@privy-io/server-auth";

export interface PrivyUpdateEventPayload {
  type:
    | "user.authenticated"
    | "user.linked_account"
    | "user.unlinked_account"
    | "user.updated_account";
  account: LinkedAccountWithMetadata;
  user: User;
}

export interface PrivyTransferEventPayload {
  type: "user.transferred_account";
  fromUser: FromUser;
  toUser: User;
  account: LinkedAccountWithMetadata;
  deletedUser: boolean;
}

export type PrivyWebhookPayload =
  | PrivyUpdateEventPayload
  | PrivyTransferEventPayload;

export interface PrivyTestPayload {
  type: "privy.test";
  message: string;
}

export interface FromUser {
  id: string;
}
