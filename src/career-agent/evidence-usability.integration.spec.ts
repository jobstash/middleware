import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PostgresService } from "src/postgres/postgres.service";
import { CareerRepository } from "./career.repository";
import { CareerEvidence } from "./career.types";
import { evidenceInSourceScope } from "./evidence-usability";
import { mergeDocumentEvidence } from "./merge-career";
import { candidateScreeningSource, unknownDocumentProvenance } from "./candidate-document-provenance";
import { CANDIDATE_SOURCE_MATCHING_VERSION } from "./candidate-source-location";

const url = process.env.CAREER_TEST_DATABASE_URL ?? process.env.MCP_DATABASE_TEST_URL;
(url ? describe : describe.skip)("Source-grounded career facts", () => {
  let db: PostgresService, career: CareerRepository;
  const schema = `evidence_${randomUUID().replace(/-/g, "")}`;
  let documentId: string, applicationId: string, answerId: string;
  const sourceText = "Built payment APIs for twelve markets.";
  beforeAll(async () => {
    const target = new URL(url!);
    if (!["127.0.0.1", "localhost"].includes(target.hostname) ||
        !["/career_agent_test", "/jobstash_hosted_career_test", "/jobstash_mcp_test"].includes(target.pathname))
      throw new Error("A dedicated local test database is required");
    db = new PostgresService({ url: url!, applicationName: "evidence-usability-tests", maxConnections: 2, statementTimeoutMs: 10000 });
    const dataSource = db.getDataSource();
    dataSource.setOptions({ extra: { ...dataSource.options.extra, options: `-c search_path=${schema}` } });
    await db.onModuleInit();
    await db.query(`CREATE SCHEMA ${schema}`);
    await db.query(`
      CREATE TABLE graph_nodes(id bigint PRIMARY KEY,label text,properties jsonb);
      CREATE TABLE candidate_career_profiles(user_node_id bigint PRIMARY KEY,revision integer DEFAULT 0,evidence jsonb DEFAULT '[]');
      CREATE TABLE candidate_documents(id uuid PRIMARY KEY,user_node_id bigint,content_hash text,source_text text,filename text,storage_kind text,created_at timestamptz DEFAULT now(),parsed_result jsonb,extraction_provenance jsonb);
      CREATE TABLE candidate_parse_attempts(id uuid PRIMARY KEY,user_node_id bigint,document_id uuid,status text);
      CREATE TABLE candidate_application_documents(id uuid PRIMARY KEY,user_node_id bigint,content jsonb);
    `);
    career = new CareerRepository(db);
  });
  afterAll(async () => {
    if (db) { await db.query(`DROP SCHEMA ${schema} CASCADE`); await db.onModuleDestroy(); }
  });
  beforeEach(async () => {
    await db.query("TRUNCATE graph_nodes,candidate_career_profiles,candidate_documents,candidate_parse_attempts,candidate_application_documents");
    documentId = randomUUID(); applicationId = randomUUID(); answerId = randomUUID();
    await db.query(`INSERT INTO graph_nodes VALUES(1,'User','{"wallet":"alice"}'),(2,'User','{"wallet":"bob"}'); INSERT INTO candidate_career_profiles(user_node_id) VALUES(1),(2)`);
    await db.query("INSERT INTO candidate_documents(id,user_node_id,content_hash,source_text) VALUES($1,1,'current',$2)", [documentId, sourceText]);
    await db.query("INSERT INTO candidate_application_documents VALUES($1,1,$2)", [applicationId, JSON.stringify({ questions: [{ id: answerId, question: "How many markets?", answer: "Twelve", revision: 2 }] })]);
  });
  async function save(evidence: CareerEvidence[]) {
    await db.query("UPDATE candidate_career_profiles SET evidence=$1 WHERE user_node_id=1", [JSON.stringify(evidence)]);
  }
  function fact(source: CareerEvidence["source"], extra: Partial<CareerEvidence> = {}): CareerEvidence {
    return { id: randomUUID(), statement: "Built payment APIs", excluded: false, conflicts: [], source, ...extra };
  }

  it("uses a supported CV immediately and excludes rejected, conflicting, foreign and stale citations", async () => {
    const source: CareerEvidence["source"] = { kind: "document", documentId, excerpt: sourceText };
    const grounded = fact(source);
    const foreignDocumentId = randomUUID();
    await db.query("INSERT INTO candidate_documents(id,user_node_id,content_hash,source_text) VALUES($1,2,'foreign',$2)", [foreignDocumentId, sourceText]);
    await save([grounded, fact(source, { excluded: true }), fact(source, { conflicts: [grounded.id] }),
      fact({ ...source, documentId: foreignDocumentId }), fact({ ...source, excerpt: "Invented metric" }),
      fact({ ...source, contentHash: "old" }), fact({ ...source, authority: "citation" })]);
    expect((await career.usableEvidence("alice")).map(item => item.id)).toEqual([grounded.id]);
    expect(await career.usableEvidence("bob")).toEqual([]);
    const state = await career.career("alice");
    expect(state.evidence.find(item => item.id === grounded.id)).toMatchObject({ usable: true, excluded: false });
    expect(state.evidence.filter(item => item.id !== grounded.id).every(item => item.usable === false)).toBe(true);
    await db.query("UPDATE candidate_documents SET source_text='Changed source' WHERE id=$1", [documentId]);
    expect(await career.usableEvidence("alice")).toEqual([]);
  });

  it("requires a completed owned extraction receipt for image-only facts", async () => {
    const requestId = randomUUID();
    const imageFacts = mergeDocumentEvidence([], [{ statement: "Built payment APIs", excerpt: null }], documentId, "", { contentHash: "current", requestId, mode: "image" });
    await save(imageFacts);
    expect(await career.usableEvidence("alice")).toEqual([]);
    await db.query("INSERT INTO candidate_parse_attempts VALUES($1,2,$2,'completed')", [requestId, documentId]);
    expect(await career.usableEvidence("alice")).toEqual([]);
    await db.query("UPDATE candidate_parse_attempts SET user_node_id=1,status='running'");
    expect(await career.usableEvidence("alice")).toEqual([]);
    await db.query("UPDATE candidate_parse_attempts SET status='completed'");
    expect((await career.usableEvidence("alice")).map(item => item.id)).toEqual(imageFacts.map(item => item.id));
    await db.query("UPDATE candidate_documents SET content_hash='changed'");
    expect(await career.usableEvidence("alice")).toEqual([]);
  });

  it("keeps hidden legacy facts historical while admitting only the current image extraction receipt", async () => {
    const hiddenFact = fact({ kind: "document", documentId, excerpt: sourceText, contentHash: "current" });
    const provenance = unknownDocumentProvenance("current", sourceText);
    provenance.hidden = [{ text: sourceText, reason: "pdf_nonpainting_text", page: 1, part: "page:1:operator:3" }];
    const projected = candidateScreeningSource({ source_text: sourceText, content_hash: "current", extraction_provenance: provenance });
    const oldRequestId = randomUUID(), currentRequestId = randomUUID();
    const oldImages = mergeDocumentEvidence([], [{ statement: "Old uncorroborated qualification", excerpt: null }], documentId,
      sourceText, { contentHash: "current", requestId: oldRequestId, mode: "image" });
    const currentImages = mergeDocumentEvidence([], [{ statement: "Built payment APIs, corroborated on the page image", excerpt: null }], documentId,
      sourceText, { contentHash: "current", requestId: currentRequestId, mode: "image" });
    await db.query("UPDATE candidate_documents SET extraction_provenance=$2 WHERE id=$1", [documentId, JSON.stringify(provenance)]);
    await save([hiddenFact, ...oldImages, ...currentImages]);
    await db.query("INSERT INTO candidate_parse_attempts VALUES($1,1,$3,'completed'),($2,1,$3,'completed')",
      [oldRequestId, currentRequestId, documentId]);
    expect(await career.usableEvidence("alice")).toEqual([]);
    await db.query("UPDATE candidate_documents SET parsed_result=$2 WHERE id=$1", [documentId, JSON.stringify({
      matchingContext: { version: CANDIDATE_SOURCE_MATCHING_VERSION, contentHash: "current",
        sourceTextHash: createHash("md5").update(sourceText).digest("hex"),
        projectionText: projected.candidate_cv, projectionHash: createHash("md5").update(projected.candidate_cv).digest("hex"),
        sourceProvenance: provenance, mode: "image", requestId: currentRequestId },
    })]);
    expect((await career.usableEvidence("alice")).map(item => item.id)).toEqual(currentImages.map(item => item.id));
    expect((await career.career("alice")).evidence.find(item => item.id === hiddenFact.id))
      .toMatchObject({ statement: hiddenFact.statement, usable: false });
  });

  it("invalidates an answer claim on question, answer or revision change and keeps it application-scoped", async () => {
    const answer = fact({ kind: "answer", applicationDocumentId: applicationId, answerId, answerRevision: 2, excerpt: "How many markets?\nTwelve" });
    await save([answer]);
    expect((await career.usableEvidence("alice")).map(item => item.id)).toEqual([answer.id]);
    expect(evidenceInSourceScope(answer, documentId)).toBe(false);
    for (const question of [
      { id: answerId, question: "How many markets?", answer: "Twelve", revision: 3 },
      { id: answerId, question: "How many engineers?", answer: "Twelve", revision: 2 },
      { id: answerId, question: "How many markets?", answer: null, revision: 2 },
    ]) {
      await db.query("UPDATE candidate_application_documents SET content=$1", [JSON.stringify({ questions: [question] })]);
      expect(await career.usableEvidence("alice")).toEqual([]);
    }
  });

  it("retains exclusions and candidate authorship while retiring live approval flags", async () => {
    const legacy = [
      { ...fact({ kind: "document", documentId, excerpt: sourceText }), confirmation: "unconfirmed" },
      { ...fact({ kind: "document", documentId, excerpt: sourceText }), confirmation: "rejected" },
      { ...fact({ kind: "candidate", excerpt: null }), confirmation: "confirmed" },
    ];
    await db.query("UPDATE candidate_career_profiles SET evidence=$1 WHERE user_node_id=1", [JSON.stringify(legacy)]);
    const migration = readFileSync("scripts/sql/career-evidence-usability.sql", "utf8");
    await db.query(migration.slice(0, migration.indexOf("CREATE OR REPLACE FUNCTION")));
    const facts = (await career.career("alice")).evidence;
    expect(facts.map(item => item.excluded)).toEqual([false, true, false]);
    expect(facts.every(item => !("confirmation" in item))).toBe(true);
    expect((await career.usableEvidence("alice")).map(item => item.id)).toEqual([legacy[0].id, legacy[2].id]);
    expect(evidenceInSourceScope(facts[2], documentId)).toBe(true);
    expect(evidenceInSourceScope(facts[0], randomUUID())).toBe(false);
  });
});
