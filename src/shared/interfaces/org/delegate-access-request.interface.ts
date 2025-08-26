import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class DelegateAccessRequest {
  public static readonly DelegateAccessRequestType = t.strict({
    id: t.string,
    fromOrgId: t.string,
    fromOrgName: t.string,
    fromOrgLogo: t.union([t.string, t.null]),
    toOrgId: t.string,
    toOrgName: t.string,
    toOrgLogo: t.union([t.string, t.null]),
    status: t.union([
      t.literal("pending"),
      t.literal("accepted"),
      t.literal("revoked"),
    ]),
    requestor: t.string,
    createdTimestamp: t.number,
    expiryTimestamp: t.number,
    updatedTimestamp: t.union([t.number, t.null]),
    grantor: t.union([t.string, t.null]),
    revoker: t.union([t.string, t.null]),
  });

  @ApiProperty({
    description: "The unique identifier for the delegate access request",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  id: string;

  @ApiProperty({
    description: "The ID of the organization requesting the delegate access",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  fromOrgId: string;

  @ApiProperty({
    description: "The name of the organization requesting the delegate access",
    example: "My Organization",
  })
  fromOrgName: string;

  @ApiProperty({
    description: "The logo of the organization requesting the delegate access",
    example: "https://example.com/logo.png",
  })
  fromOrgLogo: string | null;

  @ApiProperty({
    description: "The ID of the organization being granted the delegate access",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  toOrgId: string;

  @ApiProperty({
    description:
      "The name of the organization being granted the delegate access",
    example: "My Organization",
  })
  toOrgName: string;

  @ApiProperty({
    description:
      "The logo of the organization being granted the delegate access",
    example: "https://example.com/logo.png",
  })
  toOrgLogo: string | null;

  @ApiProperty({
    description: "The status of the delegate access request",
    example: "pending",
  })
  status: "pending" | "accepted" | "revoked";

  @ApiProperty({
    description: "The  of the user requesting the delegate access",
    example: "0x1234567890abcdef",
  })
  requestor: string;

  @ApiProperty({
    description: "The timestamp when the delegate access request was created",
    example: 1719859200,
  })
  createdTimestamp: number;

  @ApiProperty({
    description: "The timestamp when the delegate access request expires",
    example: 1719859200,
  })
  expiryTimestamp: number;

  @ApiProperty({
    description: "The timestamp when the delegate access request was updated",
    example: 1719859200,
  })
  updatedTimestamp: number | null;

  @ApiProperty({
    description: "The  of the user granting the delegate access",
    example: "0x1234567890abcdef",
  })
  grantor: string | null;

  @ApiProperty({
    description: "The  of the user revoking the delegate access",
    example: "0x1234567890abcdef",
  })
  revoker: string | null;

  constructor(raw: DelegateAccessRequest) {
    const result = DelegateAccessRequest.DelegateAccessRequestType.decode(raw);

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `DelegateAccessRequest instance with id ${raw.id} failed validation with error '${x}'`,
        );
      });
    }

    const {
      id,
      fromOrgId,
      fromOrgName,
      fromOrgLogo,
      toOrgId,
      toOrgName,
      toOrgLogo,
      status,
      requestor,
      createdTimestamp,
      expiryTimestamp,
      updatedTimestamp,
      grantor,
      revoker,
    } = raw;
    this.id = id;
    this.fromOrgId = fromOrgId;
    this.fromOrgName = fromOrgName;
    this.fromOrgLogo = fromOrgLogo;
    this.toOrgId = toOrgId;
    this.toOrgName = toOrgName;
    this.toOrgLogo = toOrgLogo;
    this.status = status;
    this.requestor = requestor;
    this.createdTimestamp = createdTimestamp;
    this.expiryTimestamp = expiryTimestamp;
    this.updatedTimestamp = updatedTimestamp;
    this.grantor = grantor;
    this.revoker = revoker;
  }
}
