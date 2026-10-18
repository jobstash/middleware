import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { PostgresService } from "src/postgres/postgres.service";
import { prepareMcpTestTables } from "src/mcp/mcp-test-fixture";
import { CareerRepository } from "./career.repository";
import { CandidateSetupService } from "./candidate-setup.service";
import { CandidateInvocationContext } from "./candidate-context";

const url = process.env.MCP_DATABASE_TEST_URL;
(url ? describe : describe.skip)("Candidate setup intents", () => {
  let db: PostgresService, setup: CandidateSetupService;
  let first: Extract<CandidateInvocationContext, {kind:"oauth"}>, second: typeof first;
  const session: CandidateInvocationContext = {kind:"session",owner:"1",wallet:"alice"};
  beforeAll(async () => {
    const target = new URL(url!);
    if(target.hostname!=="127.0.0.1" || target.pathname!=="/jobstash_mcp_test") throw Error("Dedicated test database required");
    db = new PostgresService({url:url!,applicationName:"candidate-setup-tests",maxConnections:5,statementTimeoutMs:10000});
    await db.onModuleInit();
    await prepareMcpTestTables(db);
    setup = new CandidateSetupService(db,new CareerRepository(db),new ConfigService({RECRUITERS_PUBLIC_ORIGIN:"https://recruiters.example"}));
  });
  afterAll(async()=>db?.onModuleDestroy());
  beforeEach(async()=>{
    await db.query("TRUNCATE graph_nodes RESTART IDENTITY CASCADE");
    await db.query(`INSERT INTO graph_nodes(label,properties) VALUES('User','{"wallet":"alice"}'),('User','{"wallet":"bob"}')`);
    const clientId=randomUUID();
    await db.query("INSERT INTO mcp_clients(id,name,redirect_uris) VALUES($1,'test','[]')",[clientId]);
    first={kind:"oauth",owner:"1",wallet:"alice",clientId,grantId:randomUUID(),scopes:["account:read","account:write"]};
    second={...first,grantId:randomUUID()};
    for(const context of [first,second])await db.query("INSERT INTO mcp_grants(id,user_node_id,client_id,resource,scope,expires_at) VALUES($1,1,$2,'https://mcp.example/mcp','account:read account:write',now()+interval '1 day')",[context.grantId,clientId]);
  });
  it("allows matching-account setup without membership while binding the locator to the originating grant",async()=>{
    const input={requestId:randomUUID(),revision:0,provider:"openai" as const};
    const saved=await setup.create(first,"provider",input);
    expect(saved.url).toBe(`https://recruiters.example/setup/${saved.id}`);
    expect(await setup.status(session,saved.id)).toEqual(saved);
    expect(await setup.status(first,saved.id)).toEqual(saved);
    await expect(setup.status(second,saved.id)).rejects.toThrow();
    await expect(setup.status({kind:"session",owner:"2",wallet:"bob"},saved.id)).rejects.toThrow();
    expect(await setup.create(first,"provider",input)).toEqual(saved);
    await expect(setup.create(second,"provider",input)).rejects.toThrow();
    await db.query("UPDATE mcp_grants SET revoked_at=now() WHERE id=$1",[first.grantId]);
    await expect(setup.status(session,saved.id)).rejects.toThrow();
    await expect(setup.create(first,"provider",input)).rejects.toThrow();
  });
  it("keeps GET reusable but rejects expired links and foreign completion references",async()=>{
    const saved=await setup.create(session,"provider",{requestId:randomUUID(),revision:0});
    await expect(setup.complete(session,saved.id,{kind:"connection",id:randomUUID()})).rejects.toThrow();
    expect((await setup.status(session,saved.id)).status).toBe("pending");
    await db.query("UPDATE candidate_setup_intents SET expires_at=now()-interval '1 second' WHERE id=$1",[saved.id]);
    await expect(setup.status(session,saved.id)).rejects.toThrow();
  });
});
