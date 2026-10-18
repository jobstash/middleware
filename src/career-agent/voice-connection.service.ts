import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PostgresService } from "src/postgres/postgres.service";
import { CareerRepository } from "./career.repository";
import { DisconnectVoiceInput } from "./voice-connection.dto";

export interface VoiceConnectionState {
  id: string | null;
  provider: "openai";
  status: "pending" | "connected" | "disconnected";
  revision: number;
  model: "gpt-live-1";
}
type ConnectionRow = { id: string; status: VoiceConnectionState["status"]; generation: number };

@Injectable()
export class VoiceConnectionService {
  constructor(private readonly db: PostgresService, private readonly career: CareerRepository) {}

  private publicState(row?: ConnectionRow): VoiceConnectionState {
    return { id: row?.id ?? null, provider: "openai", status: row?.status ?? "disconnected", revision: row?.generation ?? 0, model: "gpt-live-1" };
  }

  async connection(wallet: string): Promise<VoiceConnectionState> {
    const [row] = await this.db.query<ConnectionRow>(
      `SELECT c.id,CASE WHEN d.status='active' AND c.public_state->>'execution'='device' THEN c.status ELSE 'disconnected' END AS status,c.generation
       FROM candidate_voice_connections c LEFT JOIN candidate_devices d ON d.id=c.device_id AND d.user_node_id=c.user_node_id WHERE c.user_node_id=$1
       ORDER BY (c.status='connected') DESC,c.updated_at DESC,c.id LIMIT 1`,
      [await this.career.owner(wallet)],
    );
    return this.publicState(row);
  }

  async disconnect(wallet: string, input: DisconnectVoiceInput): Promise<VoiceConnectionState> {
    return this.career.mutate(wallet, "voice-disconnect", input, async (db, owner) => {
      const [row] = await db.query("SELECT id,status,generation FROM candidate_voice_connections WHERE user_node_id=$1 AND id=$2 FOR UPDATE", [owner, input.connectionId]);
      if (!row) throw new NotFoundException("Voice connection not found");
      if (input.revision !== row.generation) throw new ConflictException("Your voice connection changed. Reload its saved state.");
      await db.query("UPDATE candidate_voice_connections SET generation=generation+1,status='disconnected',updated_at=now() WHERE id=$1 AND user_node_id=$2", [row.id, owner]);
      // The companion observes this durable revocation on its next signed heartbeat.
      await db.query("UPDATE candidate_voice_sessions SET status='closing',updated_at=now() WHERE user_node_id=$1 AND voice_connection_id=$2 AND status IN ('creating','active')", [owner, row.id]);
      return this.publicState({ ...row, status: "disconnected", generation: row.generation + 1 });
    });
  }
}
