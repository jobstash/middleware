import { Injectable } from "@nestjs/common";
import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";

@Injectable()
export class TelemetryService {
  constructor(
    @InjectConnection()
    private neogma: Neogma,
  ) {}

  async logUserLoginEvent(walletOrPrivyId: string): Promise<void> {
    await this.neogma.queryRunner.run(
      `
        MATCH (user:User WHERE user.wallet = $walletOrPrivyId OR user.privyId = $walletOrPrivyId)
        MERGE (user)-[:LOGGED_IN]->(history:LoginHistory)
        SET history.id = randomUUID()
        SET history.timestamp = timestamp()
      `,
      { walletOrPrivyId },
    );
  }
}
