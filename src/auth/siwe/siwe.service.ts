import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createPublicClient, fallback, http } from "viem";
import { mainnet, polygon } from "viem/chains";
import {
  ABI,
  COMMUNITY_NFT_ADDRESSES,
  ECOSYSTEMS,
} from "src/shared/constants/viem";

@Injectable()
export class SiweService {
  private readonly ethClient;
  private readonly polyClient;
  constructor(private readonly configService: ConfigService) {
    const INFRURA_ID = this.configService.get<string>("INFURA_API_KEY");
    this.ethClient = createPublicClient({
      chain: mainnet,
      transport: fallback([
        http(`https://mainnet.infura.io/v3/${INFRURA_ID}`),
        http(), // Public fallback
      ]),
    });
    this.polyClient = createPublicClient({
      chain: polygon,
      transport: fallback([
        http(`https://polygon-mainnet.infura.io/v3/${INFRURA_ID}`),
        http(), // Public fallback
      ]),
    });
  }

  async getCommunitiesForWallet(wallet: string): Promise<string[]> {
    const communities = [];
    const hasLobsterDAONFT = await this.ethClient.readContract({
      address: COMMUNITY_NFT_ADDRESSES[ECOSYSTEMS.LOBSTERDAO].address,
      abi: ABI,
      functionName: "balanceOf",
      args: [wallet as `0x${string}`],
    });
    const hasEthdamNFT = await this.polyClient.readContract({
      address: COMMUNITY_NFT_ADDRESSES[ECOSYSTEMS.ETHDAM].address,
      abi: ABI,
      functionName: "balanceOf",
      args: [wallet as `0x${string}`],
    });
    if (hasLobsterDAONFT) {
      communities.push(COMMUNITY_NFT_ADDRESSES[ECOSYSTEMS.LOBSTERDAO].label);
    }
    if (hasEthdamNFT) {
      communities.push(COMMUNITY_NFT_ADDRESSES[ECOSYSTEMS.ETHDAM].label);
    }
    return communities;
  }
}
