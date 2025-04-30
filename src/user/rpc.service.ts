import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createPublicClient, fallback, http } from "viem";
import { mainnet, polygon } from "viem/chains";
import {
  ABI,
  ECOSYSTEM_NFT_ADDRESSES,
  ECOSYSTEMS,
} from "src/shared/constants/viem";
import * as Sentry from "@sentry/node";
import { CustomLogger } from "src/shared/utils/custom-logger";

@Injectable()
export class RpcService {
  private readonly ethClient;
  private readonly polyClient;
  private readonly logger = new CustomLogger(RpcService.name);
  constructor(private readonly configService: ConfigService) {
    const INFRURA_ID = this.configService.get<string>("INFURA_API_KEY");
    const batchConfig = {
      multicall: {
        batchSize: 10000,
        wait: 10000,
      },
    };
    this.ethClient = createPublicClient({
      chain: mainnet,
      transport: fallback([
        http(`https://mainnet.infura.io/v3/${INFRURA_ID}`),
        http(), // Public fallback
      ]),
      batch: batchConfig,
    });
    this.polyClient = createPublicClient({
      chain: polygon,
      transport: fallback([
        http(`https://polygon-mainnet.infura.io/v3/${INFRURA_ID}`),
        http(), // Public fallback
      ]),
      batch: batchConfig,
    });
  }

  async getEcosystemsForWallet(wallet: string): Promise<string[]> {
    try {
      const ecosystems = [];
      const hasLobsterDAONFT = await this.ethClient.readContract({
        address: ECOSYSTEM_NFT_ADDRESSES[ECOSYSTEMS.LOBSTERDAO].address,
        abi: ABI,
        functionName: "balanceOf",
        args: [wallet as `0x${string}`],
      });
      const hasEthdamNFT = await this.polyClient.readContract({
        address: ECOSYSTEM_NFT_ADDRESSES[ECOSYSTEMS.ETHDAM].address,
        abi: ABI,
        functionName: "balanceOf",
        args: [wallet as `0x${string}`],
      });
      if (hasLobsterDAONFT) {
        ecosystems.push(ECOSYSTEM_NFT_ADDRESSES[ECOSYSTEMS.LOBSTERDAO].label);
      }
      if (hasEthdamNFT) {
        ecosystems.push(ECOSYSTEM_NFT_ADDRESSES[ECOSYSTEMS.ETHDAM].label);
      }
      return ecosystems;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "proxy-call",
          source: "rpc.service",
        });
        scope.setExtra("input", { wallet });
        Sentry.captureException(err);
      });
      this.logger.error(`RpcService::getEcosystemsForWallet ${err.message}`);
      return [];
    }
  }
}
