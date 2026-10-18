import { generateKeyPairSync, randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { PostgresService } from "src/postgres/postgres.service";
import { AgentService } from "./agent.service";
import { CareerRepository } from "./career.repository";
import { DeviceExecutionService } from "./device-execution.service";
import { DeviceIdentity } from "./device-execution.protocol";
import { ScreeningService } from "./screening.service";

export function createDeviceAgent(db: PostgresService, career: CareerRepository, config: ConfigService, screening?: ScreeningService) {
  return new AgentService(db, career, config, screening, new DeviceExecutionService(db, career, config));
}

/** Domain fixtures use paired metadata; signature/replay tests exercise the HTTP adapter separately. */
export async function pairedDeviceFixture(db: PostgresService, owner: string, online = true): Promise<DeviceIdentity> {
  const id = randomUUID();
  const { publicKey } = generateKeyPairSync("ed25519");
  await db.query(`INSERT INTO candidate_devices(id,user_node_id,public_key,label,status,pairing_request_id,last_seen_at)
    VALUES($1,$2,$3,'Test companion','active',$4,CASE WHEN $5 THEN now() ELSE NULL END)`,
  [id, owner, publicKey.export({ type: "spki", format: "der" }).toString("base64url"), randomUUID(), online]);
  return { id, owner };
}

export async function deviceConnectionFixture(db: PostgresService, owner: string, options: {
  id?: string; provider?: string; model?: string; reasoningEffort?: string | null; online?: boolean;
} = {}) {
  const device = await pairedDeviceFixture(db, owner, options.online ?? true);
  const id = options.id ?? randomUUID();
  const provider = options.provider ?? "openai";
  const model = options.model ?? "gpt-6-astra";
  const reasoningEffort = options.reasoningEffort ?? null;
  await db.query(`INSERT INTO candidate_ai_connections(id,user_node_id,provider,status,device_id,public_state,model_catalog)
    VALUES($1,$2,$3,'connected',$4,$5,$6)`, [id, owner, provider, device.id,
    JSON.stringify({ execution: "device", deviceId: device.id, model, reasoningEffort }),
    JSON.stringify([{ id: model, label: model, reasoningEfforts: ["low", "medium", "high"], defaultReasoningEffort: null }])]);
  return { id, device };
}

export async function claimDeviceFixture(db: PostgresService, agent: AgentService, wallet: string, connectionId: string, requestId?: string) {
  const [connection] = await db.query<{ device_id: string }>("SELECT device_id FROM candidate_ai_connections WHERE id=$1", [connectionId]);
  const owner = await new CareerRepository(db).owner(wallet);
  return agent.claimDevice({ id: connection.device_id, owner }, connectionId, requestId);
}

export async function leaseDeviceRequestFixture(db: PostgresService, requestId: string, leaseId: string = randomUUID()) {
  await db.query(`UPDATE candidate_agent_requests r SET status='running',worker_id=$2,heartbeat_at=now(),started_at=now(),
    device_id=c.device_id,connection_generation=c.generation,lease_expires_at=now()+interval '45 seconds',
    device_envelope=jsonb_build_object('connectionId',c.id,'provider',c.provider,'generation',c.generation,'model',c.public_state->'model','reasoningEffort',c.public_state->'reasoningEffort'),
    source_pins=(SELECT jsonb_build_object('documentId',d.id,'contentHash',d.content_hash,
      'sourceTextHash',encode(sha256(convert_to(COALESCE(d.source_text,''),'UTF8')),'hex'),
      'provenance',COALESCE(to_jsonb(d)->'extraction_provenance','null'::jsonb))
      FROM candidate_documents d WHERE d.user_node_id=r.user_node_id
        AND d.id::text=COALESCE(s.context_seed->>'sourceDocumentId',CASE WHEN s.object_kind='category' THEN to_jsonb(s)->>'object_id' END))
    FROM candidate_agent_sessions s JOIN candidate_ai_connections c ON c.id=s.connection_id
    WHERE r.id=$1 AND s.id=r.session_id`, [requestId, leaseId]);
  await db.query(`UPDATE candidate_ai_connections c SET execution_lease=r.id,execution_lease_until=now()+interval '45 seconds'
    FROM candidate_agent_sessions s JOIN candidate_agent_requests r ON r.session_id=s.id WHERE r.id=$1 AND c.id=s.connection_id`, [requestId]);
  return leaseId;
}
