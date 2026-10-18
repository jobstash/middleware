import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { EntityManager } from "typeorm";
import { PostgresService } from "src/postgres/postgres.service";
import { CareerRepository } from "./career.repository";
import { CareerEvidence } from "./career.types";
import {
  ExportInput,
  DraftInput,
  AnswerQuestionInput,
  PrepareInput,
  EditDraftInput,
  SaveCvInput,
} from "./application.dto";
import { CAREER_CV_LAYOUT_VERSION, measureCareerCvLayout, renderCareerCvPdf, renderCareerPdf } from "./career-pdf";
import type { CareerCvLayout } from "./career-pdf";
import { applyCvBaselineChanges, assertCvBaselineCurrent, buildCvBaseline } from "./cv-source-baseline";
import type { CvBaselineSource, CvDraftBaseline } from "./cv-source-baseline";
import { buildCvPresentation } from "./cv-document-layout";
import type { CvPresentation } from "./cv-document-layout";
import {
  applicationRequirements,
  requirementTerms,
} from "./application-requirements";
interface Heading {
  name?: string;
  contact?: string;
  location?: string;
}
interface Selection {
  kind?: CareerEvidence["kind"];
  attribute?: CareerEvidence["attribute"];
  employer?: string;
  role?: string;
  startDate?: string;
  endDate?: string;
  evidenceId: string;
  text: string;
  source: CareerEvidence["source"];
}
interface CvVersion extends Record<string, unknown> {
  direction?: string;
  id: string;
  cvId: string;
  revision: number;
  name: string;
  heading?: Heading;
  selections: Selection[];
  baseline?: CvDraftBaseline;
  cvLayout?: CareerCvLayout;
  cvPresentation?: CvPresentation;
}
interface Proposal extends Selection {
  original: string;
  excluded: boolean;
  authorship?: "candidate";
}
interface DraftSection {
  id: string;
  kind: "letter" | "answer";
  question?: string;
  text: string;
  evidenceIds: string[];
  citations?: CareerEvidence[];
  excluded: boolean;
  authorship?: "candidate";
}
interface ApplicationQuestion {
  id: string;
  question: string;
  stage?: "situation" | "task" | "action" | "result";
  answer: string | null;
  revision: number;
}
interface Content {
  applyUrl?: string;
  direction?: string;
  directionRequirements?: {
    text: string;
    vacancies: number;
    sampleSize: number;
    evidenceIds: string[];
  }[];
  heading?: Heading;
  sections?: DraftSection[];
  questions?: ApplicationQuestion[];
  cvBaseline?: CvDraftBaseline;
  cvLayout?: CareerCvLayout;
  cvPresentation?: CvPresentation;
  cvBaselineEvidence?: Record<string, CareerEvidence[]>;
  cvBaselineAuthorship?: Record<string, "candidate">;
  title: string;
  proposals: Proposal[];
  requirements: {
    text: string;
    evidenceIds: string[];
    state: "supported" | "unclear" | "gap";
  }[];
  answers: { question: string; text: string; evidenceIds: string[] }[];
}
interface Document extends Record<string, unknown> {
  shortUUID?: string;
  id: string;
  revision: number;
  cvVersionId: string;
  applicationId: string;
  content: Content;
}
const terms = requirementTerms;
const questionKey = (value: string): string =>
  value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

/** Materialize optional collections without altering saved draft content. */
function normalizeContent(content: Content): Content {
  return {
    ...content,
    sections: content.sections ?? [],
    questions: content.questions ?? [],
  };
}
@Injectable()
export class ApplicationService {
  constructor(
    private readonly db: PostgresService,
    private readonly career: CareerRepository,
  ) {}
  async cvGuidance(wallet: string, direction: string) {
    const owner = await this.career.owner(wallet);
    await this.career.requireAdvanced(owner);
    const sample = await this.db.query<{
      jobId: string;
      payload: Record<string, unknown>;
    }>(
      `
      SELECT job.short_uuid AS "jobId", jsonb_build_object('description',original.properties->>'content') AS payload
      FROM job_search_documents job
      JOIN LATERAL (SELECT node.properties FROM graph_relationships edge JOIN graph_nodes node ON node.id=edge.source_id AND node.label='Jobpost'
        WHERE edge.target_id=job.job_node_id AND edge.type='HAS_STRUCTURED_JOBPOST' LIMIT 1) original ON true
      WHERE job.online AND NOT job.blocked AND job.published_timestamp <= extract(epoch FROM now())*1000
        AND EXISTS (SELECT 1 FROM jsonb_each_text(COALESCE(job.filter_labels->'classifications','{}')) c WHERE c.value=$1)
      ORDER BY job.published_timestamp DESC LIMIT 100`,
      [direction],
    );
    const counts = new Map<
      string,
      { text: string; vacancies: number; sourceJobIds: string[] }
    >();
    for (const row of sample)
      for (const text of new Set(applicationRequirements(row.payload))) {
        const key = text.toLowerCase().replace(/\s+/g, " "),
          entry = counts.get(key) ?? { text, vacancies: 0, sourceJobIds: [] };
        entry.vacancies++;
        entry.sourceJobIds.push(row.jobId);
        counts.set(key, entry);
      }
    const profile = await this.career.career(wallet);
    const usable = (await this.career.usableEvidence(wallet))
      .filter(e => e.source.kind !== "answer");
    const usableIds = new Set(usable.map(e => e.id));
    return {
      direction,
      sampleSize: sample.length,
      asOf: new Date().toISOString(),
      requirements: [...counts.values()]
        .sort((a, b) => b.vacancies - a.vacancies)
        .slice(0, 16)
        .map(requirement => {
          const matches = profile.evidence.filter(
            e =>
              e.source.kind !== "answer" &&
              !e.excluded &&
              [...terms(e.statement)].filter(t =>
                terms(requirement.text).has(t),
              ).length >= 3,
          );
          const evidenceIds = matches
            .filter(e => usableIds.has(e.id))
            .map(e => e.id);
          const unclearEvidenceIds = matches
            .filter(e => !usableIds.has(e.id))
            .map(e => e.id);
          return {
            ...requirement,
            evidenceIds,
            unclearEvidenceIds,
            state: matches.length ? "unclear" : "gap",
            matchMethod: "lexical-suggestion",
            excerpt: requirement.text,
          };
        }),
      usableEvidence: usable,
      unavailableEvidence: profile.evidence.filter(e => e.source.kind !== "answer" && !usableIds.has(e.id)),
      nextAction:
        "Use supported strengths in the draft. Ask an optional, specific question when a missing outcome, project scale or relevant example would strengthen the application.",
      note: "Original-ad excerpts are context, not qualifications or verified universal requirements.",
    };
  }
  async downloadCv(wallet: string, id: string): Promise<Buffer> {
    const [cv] = await this.db.query<CvVersion>(
      `SELECT name,heading,selections,baseline FROM candidate_cv_versions WHERE id=$1 AND user_node_id=$2`,
      [id, await this.career.owner(wallet)],
    );
    if (!cv) throw new NotFoundException("CV not found");
    const baseline = await this.resolveCvBaseline(wallet, cv.baseline, cv.selections, this.db, true);
    await this.assertBaselineUsable(wallet, baseline!, this.db);
    return renderCareerCvPdf({
      heading: cv.heading ?? {},
      baseline: baseline!,
    });
  }
  async cvs(wallet: string): Promise<CvVersion[]> {
    const owner = await this.career.owner(wallet);
    const cvs = await this.db.query<CvVersion>(
      `SELECT id,cv_id AS "cvId",revision,name,heading,selections,direction,guidance,baseline,cv_layout AS "cvLayout" FROM candidate_cv_versions WHERE user_node_id=$1 ORDER BY created_at DESC`,
      [owner],
    );
    for (const cv of cvs) {
      cv.baseline = await this.resolveCvBaseline(wallet, cv.baseline, cv.selections);
      cv.cvLayout = cv.cvLayout?.version === CAREER_CV_LAYOUT_VERSION ? cv.cvLayout : undefined;
      cv.cvPresentation = cv.baseline ? buildCvPresentation(cv.baseline, cv.heading) : undefined;
    }
    return cvs;
  }
  async saveCv(wallet: string, input: SaveCvInput): Promise<CvVersion> {
    return this.career.mutate(wallet, "cv", input, async (db, owner) => {
      await this.career.requireAdvanced(owner, db);
      if (input.direction) {
        const [known] = await db.query(
          "SELECT 1 FROM job_search_documents j CROSS JOIN LATERAL jsonb_each_text(COALESCE(j.filter_labels->'classifications','{}')) c WHERE c.value=$1 LIMIT 1",
          [input.direction],
        );
        if (!known)
          throw new BadRequestException("Choose an existing career direction");
      }
      const [latest] = input.cvId
        ? await db.query(
            `SELECT revision,baseline,selections,heading,direction FROM candidate_cv_versions WHERE user_node_id=$1 AND cv_id=$2 ORDER BY revision DESC LIMIT 1`,
            [owner, input.cvId],
          )
        : [];
      if (input.cvId && !latest) throw new NotFoundException("CV not found");
      if ((latest?.revision ?? 0) !== input.revision)
        throw new ConflictException("CV changed");
      const evidence = (await this.career.usableEvidence(wallet, db))
        .filter(e => e.source.kind !== "answer");
      const evidenceById = new Map(evidence.map(fact => [fact.id, fact]));
      const [source] = await db.query(
        `SELECT id,content_hash AS "contentHash",source_text AS "sourceText" FROM candidate_documents WHERE id=$1 AND user_node_id=$2`,
        [input.sourceDocumentId, owner],
      );
      if (!source) throw new NotFoundException("Original source CV not found");
      const previousBaseline = latest
        ? await this.resolveCvBaseline(wallet, latest.baseline, latest.selections, db, true)
        : undefined;
      if (previousBaseline && previousBaseline.sourceDocumentId !== input.sourceDocumentId)
        throw new BadRequestException("Create a separate CV when choosing a different original source");
      if (previousBaseline) assertCvBaselineCurrent(previousBaseline, source);
      const baseline = applyCvBaselineChanges(
        previousBaseline ?? buildCvBaseline(source), input.baselineChanges ?? [], input.baselineOrder,
      );
      for (const change of input.baselineChanges ?? [])
        if (change.evidenceIds?.length)
          this.citedEvidence(evidenceById, change.evidenceIds);
      if (input.baselineChanges?.length) await this.assertBaselineUsable(wallet, baseline, db);
      const selections = input.selections.map(s => {
        const fact = evidenceById.get(s.evidenceId);
        if (!fact || fact.statement !== s.text)
          throw new BadRequestException(
            "CV facts must match current usable career evidence",
          );
        return {
          ...s,
          source: fact.source,
          kind: fact.kind,
          attribute: fact.attribute,
          employer: fact.employer,
          role: fact.role,
          startDate: fact.startDate,
          endDate: fact.endDate,
        };
      });
      const analysis = input.direction
        ? await this.cvGuidance(wallet, input.direction)
        : null;
      const value = {
        guidance: analysis
          ? {
              direction: analysis.direction,
              asOf: analysis.asOf,
              sampleSize: analysis.sampleSize,
              requirements: analysis.requirements,
            }
          : null,
        id: randomUUID(),
        cvId: input.cvId ?? randomUUID(),
        revision: input.revision + 1,
        name: input.name.trim(),
        heading: input.heading ?? latest?.heading ?? {},
        direction: input.direction ?? latest?.direction ?? null,
        selections,
        baseline,
        cvLayout: await measureCareerCvLayout({ heading: input.heading ?? latest?.heading ?? {}, baseline }),
      };
      await db.query(
        `INSERT INTO candidate_cv_versions(id,user_node_id,cv_id,revision,name,selections,heading,direction,guidance,baseline,cv_layout) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          value.id,
          owner,
          value.cvId,
          value.revision,
          value.name,
          JSON.stringify(selections),
          JSON.stringify(value.heading),
          value.direction,
          JSON.stringify(value.guidance),
          JSON.stringify(baseline),
          JSON.stringify(value.cvLayout),
        ],
      );
      return { ...value, cvPresentation: buildCvPresentation(baseline, value.heading) };
    });
  }
  async documents(wallet: string): Promise<Document[]> {
    const documents = await this.db.query<Document>(
      `SELECT d.id,d.revision,d.cv_version_id AS "cvVersionId",d.application_id AS "applicationId",a.short_uuid AS "shortUUID",d.content
       FROM candidate_application_documents d JOIN candidate_applications a ON a.id=d.application_id AND a.user_node_id=d.user_node_id
       WHERE d.user_node_id=$1 ORDER BY d.updated_at DESC`,
      [await this.career.owner(wallet)],
    );
    for (const document of documents) {
      document.content = normalizeContent(document.content);
      document.content.cvBaseline = await this.resolveCvBaseline(wallet, document.content.cvBaseline, document.content.proposals);
    }
    return documents.map(document => this.presentDocument(document));
  }
  async document(wallet: string, id: string): Promise<Document> {
    const [document] = await this.db.query<Document>(
      `SELECT d.id,d.revision,d.cv_version_id AS "cvVersionId",d.application_id AS "applicationId",a.short_uuid AS "shortUUID",d.content
       FROM candidate_application_documents d JOIN candidate_applications a ON a.id=d.application_id AND a.user_node_id=d.user_node_id
       WHERE d.user_node_id=$1 AND (d.id=$2 OR d.application_id=$2)
       ORDER BY d.updated_at DESC,d.id LIMIT 1`,
      [await this.career.owner(wallet), id],
    );
    if (!document) throw new NotFoundException("Owned application draft not found");
    document.content = normalizeContent(document.content);
    document.content.cvBaseline = await this.resolveCvBaseline(wallet, document.content.cvBaseline, document.content.proposals);
    return this.presentDocument(document);
  }
  async prepare(wallet: string, input: PrepareInput): Promise<Document> {
    return this.career.mutate(wallet, "prepare", input, async (db, owner) => {
      await this.career.requireAdvanced(owner, db);
      const [app] = await db.query(
        `SELECT a.*,COALESCE(j.payload,a.job_snapshot) AS job,
          COALESCE(original.properties->>'content',a.original_ad_text) AS original_ad_text
          FROM candidate_applications a LEFT JOIN job_search_documents j ON j.job_node_id=a.job_node_id
          LEFT JOIN LATERAL (SELECT n.properties FROM graph_relationships e JOIN graph_nodes n ON n.id=e.source_id AND n.label='Jobpost'
            WHERE e.target_id=a.job_node_id AND e.type='HAS_STRUCTURED_JOBPOST' ORDER BY n.id LIMIT 1) original ON true
          WHERE a.id=$1 AND a.user_node_id=$2`,
        [input.applicationId, owner],
      );
      const [cv]: CvVersion[] = await db.query(
        `SELECT id,name,heading,selections,direction,baseline,cv_layout AS "cvLayout" FROM candidate_cv_versions WHERE id=$1 AND user_node_id=$2`,
        [input.cvVersionId, owner],
      );
      if (!app || !cv)
        throw new NotFoundException("Application or CV not found");
      const usable = new Map((await this.career.usableEvidence(wallet, db))
        .filter(e => e.source.kind !== "answer").map(e => [e.id, e]));
      for (const selection of cv.selections) {
        const fact = usable.get(selection.evidenceId);
        if (!fact || fact.statement !== selection.text)
          throw new BadRequestException("The CV contains evidence that is no longer usable");
      }
      const baseline = await this.resolveCvBaseline(wallet, cv.baseline, cv.selections, db, true);
      if (app.revision !== input.revision)
        throw new ConflictException("Application changed");
      const sentences = applicationRequirements({
        description: app.original_ad_text ?? "",
      });
      if (app.original_ad_text)
        await db.query(
          "UPDATE candidate_applications SET original_ad_text=$3 WHERE id=$1 AND user_node_id=$2",
          [app.id, owner, app.original_ad_text],
        );
      const requirements = sentences.map(text => {
        const required = terms(text);
        const evidenceIds = cv.selections
          .filter(
            s => [...terms(s.text)].filter(w => required.has(w)).length >= 3,
          )
          .map(s => s.evidenceId);
        return {
          text,
          excerpt: text,
          sourceJobIds: [app.short_uuid],
          asOf: new Date().toISOString(),
          matchMethod: "lexical-suggestion",
          evidenceIds,
          state: evidenceIds.length ? ("unclear" as const) : ("gap" as const),
        };
      });
      const content: Content = {
        applyUrl: typeof app.job?.url === "string" ? app.job.url : undefined,
        title: String(app.job?.title ?? cv.name),
        heading: cv.heading,
        direction: cv.direction,
        requirements,
        proposals: cv.selections.map(s => ({
          ...s,
          original: s.text,
          excluded: false,
        })),
        answers: [],
        questions: [],
        cvBaseline: baseline,
        cvLayout: cv.cvLayout?.version === CAREER_CV_LAYOUT_VERSION ? cv.cvLayout
          : await measureCareerCvLayout({ heading: cv.heading ?? {}, baseline: baseline! }),
      };
      if (cv.direction) {
        const guidance = await this.cvGuidance(wallet, cv.direction);
        content.directionRequirements = guidance.requirements.map(row => ({
          ...row,
          sampleSize: guidance.sampleSize,
          asOf: guidance.asOf,
        }));
      }
      const result = {
        id: randomUUID(),
        revision: 1,
        cvVersionId: cv.id,
        applicationId: app.id,
        shortUUID: app.short_uuid ?? undefined,
        content,
      };
      await db.query(
        `INSERT INTO candidate_application_documents(id,user_node_id,application_id,cv_version_id,content) VALUES($1,$2,$3,$4,$5)`,
        [result.id, owner, app.id, cv.id, JSON.stringify(content)],
      );
      await db.query(
        `UPDATE candidate_applications SET state=jsonb_set(state,'{status}','"preparing"'),revision=revision+1,updated_at=now()
         WHERE id=$1 AND user_node_id=$2 AND (state->>'status' IS NULL OR state->>'status'='preparing')`,
        [app.id, owner],
      );
      return this.presentDocument(result);
    });
  }
  async edit(wallet: string, id: string, input: EditDraftInput): Promise<Document> {
    return this.change(wallet, id, "edit", input, async (doc, db) => {
      if (input.baselineChanges || input.baselineOrder) {
        const baseline = await this.resolveCvBaseline(wallet, doc.content.cvBaseline, doc.content.proposals, db, true);
        doc.content.cvBaseline = applyCvBaselineChanges(baseline!, input.baselineChanges ?? [], input.baselineOrder);
        for (const change of input.baselineChanges ?? [])
          (doc.content.cvBaselineAuthorship ??= {})[change.entryId] = "candidate";
      }
      for (const change of input.changes ?? []) {
        const proposal = doc.content.proposals.find(p => p.evidenceId === change.evidenceId);
        if (!proposal) throw new NotFoundException("Draft change not found");
        if (!change.text.trim()) throw new BadRequestException("Edited text cannot be empty");
        proposal.text = change.text;
        if (change.excluded !== undefined) proposal.excluded = change.excluded;
        proposal.authorship = "candidate";
      }
      for (const change of input.sections ?? []) {
        const section = doc.content.sections?.find(s => s.id === change.sectionId);
        if (!section) throw new NotFoundException("Draft section not found");
        if (!change.text.trim()) throw new BadRequestException("Edited text cannot be empty");
        section.text = change.text;
        if (change.excluded !== undefined) section.excluded = change.excluded;
        section.authorship = "candidate";
      }
      return doc;
    });
  }
  async answerQuestion(
    wallet: string, id: string, questionId: string, input: AnswerQuestionInput,
  ): Promise<Document> {
    if (input.answer !== null && (typeof input.answer !== "string" || input.answer.length > 6000))
      throw new BadRequestException("Answer must be text or null");
    return this.change(wallet, id, `answer-question:${questionId}`, input, doc => {
      const question = doc.content.questions?.find(q => q.id === questionId);
      if (!question) throw new NotFoundException("Application question not found");
      if (question.answer !== input.answer) {
        question.answer = input.answer;
        question.revision++;
      }
      return doc;
    });
  }
  async propose(wallet: string, input: DraftInput): Promise<Document> {
    return this.change(wallet, input.documentId, "propose", input, async (doc, db) => {
      const usable = await this.draftEvidence(wallet, doc, db);
      if (input.baselineChanges || input.baselineOrder) {
        const baseline = await this.resolveCvBaseline(wallet, doc.content.cvBaseline, doc.content.proposals, db, true);
        doc.content.cvBaseline = applyCvBaselineChanges(baseline!, input.baselineChanges ?? [], input.baselineOrder);
        for (const change of input.baselineChanges ?? []) {
          const entry = doc.content.cvBaseline.entries.find(e => e.id === change.entryId)!;
          if (entry.text === entry.original) delete doc.content.cvBaselineEvidence?.[entry.id];
          else if (change.evidenceIds?.length)
            (doc.content.cvBaselineEvidence ??= {})[entry.id] = this.citedEvidence(usable, change.evidenceIds);
          if (doc.content.cvBaselineAuthorship) delete doc.content.cvBaselineAuthorship[entry.id];
        }
        await this.assertBaselineUsable(wallet, doc.content.cvBaseline, db, doc.content.proposals);
      }
      for (const change of input.changes) {
        const proposal = doc.content.proposals.find(p => p.evidenceId === change.evidenceId);
        const [fact] = this.citedEvidence(usable, [change.evidenceId]);
        if (!change.text.trim()) throw new BadRequestException("Draft text cannot be empty");
        if (proposal) {
          if (proposal.original !== fact.statement)
            throw new BadRequestException("The draft cites changed career evidence");
          proposal.text = change.text;
          delete proposal.authorship;
        } else {
          doc.content.proposals.push({
            evidenceId: fact.id, text: change.text, original: fact.statement,
            source: fact.source, employer: fact.employer, role: fact.role,
            kind: fact.kind, attribute: fact.attribute,
            startDate: fact.startDate, endDate: fact.endDate, excluded: false,
          });
        }
      }
      const sections = doc.content.sections ??= [];
      const existingSections = [...sections];
      for (const section of input.sections) {
        const citations = this.citedEvidence(usable, section.evidenceIds);
        if (!section.text.trim()) throw new BadRequestException("Draft text cannot be empty");
        const existing = section.sectionId
          ? sections.find(s => s.id === section.sectionId)
          : sections.find(s => s.kind === section.kind &&
              questionKey(s.question ?? "") === questionKey(section.question ?? "") &&
              questionKey(s.text) === questionKey(section.text));
        if (section.sectionId && !existing) throw new NotFoundException("Draft section not found");
        if (existing) {
          if (existing.kind !== section.kind) throw new BadRequestException("Draft section kind cannot change");
          if (existing.excluded) throw new BadRequestException("This draft section was excluded");
          existing.text = section.text;
          existing.question = section.question;
          existing.evidenceIds = citations.map(e => e.id);
          existing.citations = citations;
          delete existing.authorship;
        } else {
          if (existingSections.some(s => s.kind === section.kind &&
              (section.kind === "letter" || questionKey(s.question ?? "") === questionKey(section.question ?? ""))))
            throw new BadRequestException("Use sectionId to update an existing draft section");
          sections.push({
            id: randomUUID(), kind: section.kind, question: section.question,
            text: section.text, evidenceIds: citations.map(e => e.id), citations, excluded: false,
          });
        }
      }
      if (sections.length > 100 || doc.content.proposals.length > 80)
        throw new BadRequestException("Application draft is too long");
      const questions = doc.content.questions ??= [];
      const keys = new Set(questions.map(q => questionKey(q.question)));
      if ((input.questions?.length ?? 0) > 10)
        throw new BadRequestException("Ask at most ten application questions");
      for (const value of input.questions ?? []) {
        const question = value.question.trim().replace(/\s+/g, " ");
        if (!question || question.length > 2000)
          throw new BadRequestException("Application question must be between 1 and 2000 characters");
        const key = questionKey(question);
        if (keys.has(key)) continue;
        if (questions.length >= 10) throw new BadRequestException("Ask at most ten application questions");
        questions.push({
          id: randomUUID(), question, ...(value.stage ? { stage: value.stage } : {}),
          answer: null, revision: 0,
        });
        keys.add(key);
      }
      return doc;
    });
  }
  private async draftEvidence(wallet: string, doc: Document, db: EntityManager): Promise<Map<string, CareerEvidence>> {
    const excluded = new Set(doc.content.proposals.filter(p => p.excluded).map(p => p.evidenceId));
    return new Map((await this.career.usableEvidence(wallet, db))
      .filter(e => !excluded.has(e.id) &&
        (e.source.kind !== "answer" || e.source.applicationDocumentId === doc.id))
      .map(e => [e.id, e]));
  }
  private citedEvidence(usable: Map<string, CareerEvidence>, ids: string[]): CareerEvidence[] {
    if (!ids.length) throw new BadRequestException("Every draft section needs supporting career evidence");
    return [...new Set(ids)].map(id => {
      const fact = usable.get(id);
      if (!fact) throw new BadRequestException("The draft cites excluded or no longer usable career evidence");
      return fact;
    });
  }
  private async resolveCvBaseline(
    wallet: string, saved: CvDraftBaseline | undefined, selections: Selection[],
    db: NonNullable<Parameters<CareerRepository["owner"]>[1]> = this.db, required = false,
  ): Promise<CvDraftBaseline | undefined> {
    if (saved && !required) return saved;
    const sourceIds = new Set(selections.flatMap(s => s.source?.documentId ? [s.source.documentId] : []));
    const sourceId = saved?.sourceDocumentId ?? (sourceIds.size === 1 ? [...sourceIds][0] : undefined);
    if (sourceId) {
      const [source] = await db.query(
        `SELECT id,content_hash AS "contentHash",source_text AS "sourceText" FROM candidate_documents WHERE id=$1 AND user_node_id=$2`,
        [sourceId, await this.career.owner(wallet, db)],
      ) as CvBaselineSource[];
      if (source?.sourceText?.trim()) {
        if (saved) {
          assertCvBaselineCurrent(saved, source);
          return saved;
        }
        return applyCvBaselineChanges(buildCvBaseline(source), []);
      }
    }
    if (required)
      throw new BadRequestException("Choose the original source CV to create a complete tailored version. This saved fact summary is not a full CV.");
    return undefined;
  }
  private async assertBaselineUsable(
    wallet: string, baseline: CvDraftBaseline,
    db: NonNullable<Parameters<CareerRepository["owner"]>[1]>, proposals: Proposal[] = [],
  ): Promise<void> {
    const [profile] = await db.query("SELECT evidence FROM candidate_career_profiles WHERE user_node_id=$1",
      [await this.career.owner(wallet, db)]) as { evidence: CareerEvidence[] }[];
    const text = baseline.entries.map(entry => entry.text).join("\n");
    const disallowed = (profile?.evidence ?? []).filter((fact: CareerEvidence) =>
      fact.source.documentId === baseline.sourceDocumentId && (fact.excluded || fact.conflicts.length));
    if (disallowed.some((fact: CareerEvidence) =>
        [fact.statement, fact.source.excerpt].some(value => typeof value === "string" && !!value.trim() && text.includes(value))) ||
        proposals.some(proposal => proposal.excluded && text.includes(proposal.original)))
      throw new BadRequestException("The CV contains excluded or no longer usable career evidence. Rewrite the affected entry while retaining supported career context.");
  }
  private presentDocument(document: Document): Document {
    return {
      ...document,
      content: {
        ...document.content,
        cvLayout: document.content.cvLayout?.version === CAREER_CV_LAYOUT_VERSION ? document.content.cvLayout : undefined,
        cvPresentation: document.content.cvBaseline
          ? buildCvPresentation(document.content.cvBaseline, document.content.heading) : undefined,
      },
    };
  }
  private async change(
    wallet: string,
    id: string,
    operation: string,
    input: EditDraftInput | AnswerQuestionInput | DraftInput,
    work: (doc: Document, db: EntityManager) => Document | Promise<Document>,
  ): Promise<Document> {
    return this.career.mutate(
      wallet,
      `${operation}:${id}`,
      input,
      async (db, owner) => {
        await this.career.requireAdvanced(owner, db);
        const [doc]: Document[] = await db.query(
          `SELECT d.id,d.revision,d.cv_version_id AS "cvVersionId",d.application_id AS "applicationId",a.short_uuid AS "shortUUID",d.content
           FROM candidate_application_documents d JOIN candidate_applications a ON a.id=d.application_id AND a.user_node_id=d.user_node_id
           WHERE d.id=$1 AND d.user_node_id=$2`,
          [id, owner],
        );
        if (!doc) throw new NotFoundException("Document not found");
        if (doc.revision !== input.revision)
          throw new ConflictException("Document changed");
        doc.content = normalizeContent(doc.content);
        doc.content.cvBaseline = await this.resolveCvBaseline(wallet, doc.content.cvBaseline, doc.content.proposals, db);
        const result = await work(doc, db);
        if (result.content.cvBaseline && (operation === "propose" || operation === "edit"))
          result.content.cvLayout = await measureCareerCvLayout({
            heading: result.content.heading ?? {}, baseline: result.content.cvBaseline,
          });
        result.revision++;
        await db.query(
          `UPDATE candidate_application_documents SET content=$3,revision=$4,updated_at=now() WHERE id=$1 AND user_node_id=$2`,
          [id, owner, JSON.stringify(result.content), result.revision],
        );
        return this.presentDocument(result);
      },
    );
  }
  async export(
    wallet: string,
    id: string,
    input: ExportInput,
  ): Promise<{ id: string; filename: string }> {
    return this.career.mutate(
      wallet,
      `export:${id}`,
      input,
      async (db, owner) => {
        await this.career.requireAdvanced(owner, db);
        const [doc]: Document[] = await db.query(
          `SELECT id,revision,content FROM candidate_application_documents WHERE id=$1 AND user_node_id=$2`,
          [id, owner],
        );
        if (!doc) throw new NotFoundException("Document not found");
        if (doc.revision !== input.revision)
          throw new ConflictException("Document changed");
        doc.content = normalizeContent(doc.content);
        const usable = await this.draftEvidence(wallet, doc, db);
        const sections = (doc.content.sections ?? []).filter(s => !s.excluded &&
          s.kind === (input.kind === "answers" ? "answer" : input.kind));
        if (input.kind === "cv") {
          doc.content.cvBaseline = await this.resolveCvBaseline(wallet, doc.content.cvBaseline, doc.content.proposals, db, true);
          await this.assertBaselineUsable(wallet, doc.content.cvBaseline!, db, doc.content.proposals);
          for (const citations of Object.values(doc.content.cvBaselineEvidence ?? {})) {
            const current = this.citedEvidence(usable, citations.map(citation => citation.id));
            if (citations.some(citation => !current.some(fact => fact.id === citation.id &&
                fact.statement === citation.statement && JSON.stringify(fact.source) === JSON.stringify(citation.source))))
              throw new BadRequestException("The CV cites changed career evidence");
          }
        } else {
          if (!sections.length)
            throw new BadRequestException(`Add ${input.kind === "letter" ? "a cover letter" : "application answers"} before exporting`);
          for (const section of sections) {
            const current = this.citedEvidence(usable, section.evidenceIds);
            if (section.citations?.some(citation =>
              !current.some(fact => fact.id === citation.id && fact.statement === citation.statement &&
                JSON.stringify(fact.source) === JSON.stringify(citation.source))))
              throw new BadRequestException("The draft cites changed career evidence");
          }
        }
        const bytes = input.kind === "cv"
          ? await renderCareerCvPdf({ heading: doc.content.heading ?? {}, baseline: doc.content.cvBaseline! })
          : await renderCareerPdf(doc.content.title,
              sections.flatMap(s => s.question ? [s.question, s.text] : [s.text]));
        const result = {
          id: randomUUID(),
          filename: `application-${input.kind}.pdf`,
        };
        await db.query(
          `INSERT INTO candidate_exports(id,user_node_id,document_id,document_revision,kind,filename,bytes,provenance) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            result.id,
            owner,
            id,
            doc.revision,
            input.kind,
            result.filename,
            bytes,
            JSON.stringify(doc.content),
          ],
        );
        return result;
      },
    );
  }
  async exports(wallet: string): Promise<{ id: string; filename: string }[]> {
    return this.db.query(
      `SELECT id,filename,document_id AS "documentId",document_revision AS revision,created_at AS "createdAt" FROM candidate_exports WHERE user_node_id=$1 ORDER BY created_at DESC`,
      [await this.career.owner(wallet)],
    );
  }
  async provenance(
    wallet: string,
    id: string,
  ): Promise<Record<string, unknown>> {
    const [file] = await this.db.query(
      `SELECT id,document_id AS "documentId",document_revision AS revision,kind,provenance AS content,created_at AS "createdAt" FROM candidate_exports WHERE id=$1 AND user_node_id=$2`,
      [id, await this.career.owner(wallet)],
    );
    if (!file) throw new NotFoundException("Export not found");
    return file;
  }
  async revisions(
    wallet: string,
    id: string,
  ): Promise<Record<string, unknown>[]> {
    const owner = await this.career.owner(wallet);
    const [document] = await this.db.query(
      "SELECT id FROM candidate_application_documents WHERE id=$1 AND user_node_id=$2",
      [id, owner],
    );
    if (!document) throw new NotFoundException("Document not found");
    return this.db.query(
      'SELECT revision,content,created_at AS "createdAt" FROM candidate_application_document_versions WHERE document_id=$1 AND user_node_id=$2 ORDER BY revision DESC',
      [id, owner],
    );
  }
  async download(
    wallet: string,
    id: string,
  ): Promise<{ filename: string; bytes: Buffer }> {
    const [file] = await this.db.query<{ filename: string; bytes: Buffer }>(
      `SELECT filename,bytes FROM candidate_exports WHERE id=$1 AND user_node_id=$2`,
      [id, await this.career.owner(wallet)],
    );
    if (!file) throw new NotFoundException("Export not found");
    return file;
  }
}
