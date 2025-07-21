import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import * as t from "io-ts";

const SupportedNetworks = [
  "arbitrum",
  "avalanche",
  "base",
  "blast",
  "celo",
  "ethereum",
  "linea",
  "optimism",
  "palm",
  "polygon",
  ,
] as const;

export const NETWORK = {
  ...SupportedNetworks.reduce((acc, name) => ({ ...acc, [name]: null }), {}),
};

export type NetworkType =
  | "arbitrum"
  | "avalanche"
  | "base"
  | "blast"
  | "celo"
  | "ethereum"
  | "linea"
  | "optimism"
  | "palm"
  | "polygon";

const Network = t.keyof(NETWORK);

export class EcosystemActivation {
  public static readonly EcosystemActivationType = t.strict({
    id: t.string,
    name: t.string,
    contractAddress: t.string,
    tokenId: t.string,
    network: Network,
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  contractAddress: string;

  @ApiProperty()
  tokenId: string;

  @ApiProperty()
  network: NetworkType;

  constructor(raw: EcosystemActivation) {
    const { id, name, contractAddress, tokenId, network } = raw;
    const result = EcosystemActivation.EcosystemActivationType.decode(raw);

    this.id = id;
    this.name = name;
    this.contractAddress = contractAddress;
    this.tokenId = tokenId;
    this.network = network;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `tracked ecosystem ectivation instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
