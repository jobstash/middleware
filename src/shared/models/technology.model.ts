import {
  ModelFactory,
  ModelRelatedNodesI,
  Neogma,
  NeogmaInstance,
  NeogmaModel,
  QueryBuilder,
} from "neogma";
import {
  ExtractProps,
  PairedTerm,
  Technology,
  TechnologyPreferredTerm,
} from "../types";
import {
  TechnolgyBlockedTermInstance,
  TechnologyBlockedTerms,
} from "./technology-blocked-term.model";
import { TechnologyPreferredTermEntity } from "../entities/technology-preferred-term.entity";

export type TechnologyProps = ExtractProps<Technology>;

export type TechnologyInstance = NeogmaInstance<
  TechnologyProps,
  TechnologyRelations,
  TechnologyMethods
>;

export interface TechnologyRelations {
  blocked: ModelRelatedNodesI<
    ReturnType<typeof TechnologyBlockedTerms>,
    TechnolgyBlockedTermInstance
  >;
}
export interface TechnologyMethods {
  isBlockedTerm: () => Promise<boolean>;
}

export interface TechnologyStatics {
  getPreferredTerms: () => Promise<TechnologyPreferredTerm[]>;
  getBlockedTerms: () => Promise<Technology[]>;
  getAllowedTerms: () => Promise<Technology[]>;
  getPairedTerms: () => Promise<PairedTerm[]>;
}

export const Technologies = (
  neogma: Neogma,
): NeogmaModel<
  TechnologyProps,
  TechnologyRelations,
  TechnologyMethods,
  TechnologyStatics
> =>
  ModelFactory<
    TechnologyProps,
    TechnologyRelations,
    TechnologyStatics,
    TechnologyMethods
  >(
    {
      label: "Technology",
      schema: {
        id: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        name: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
        normalizedName: {
          type: "string",
          allowEmpty: false,
          required: true,
        },
      },
      primaryKeyField: "id",
      relationships: {
        blocked: {
          model: TechnologyBlockedTerms(neogma),
          name: "IS_BLOCKED_TERM",
          direction: "in",
        },
      },
      methods: {
        isBlockedTerm: async function (
          this: TechnologyInstance,
        ): Promise<boolean> {
          const blocked = await this.findRelationships({
            alias: "blocked",
            limit: 1,
          });
          return blocked[0].target.__existsInDatabase;
        },
      },
      statics: {
        getPreferredTerms: async function (): Promise<
          TechnologyPreferredTerm[]
        > {
          const query = new QueryBuilder()
            .match({
              label: "PreferredTerm",
              identifier: "pt",
            })
            .match({
              optional: true,
              related: [
                { identifier: "pt" },
                { name: "IS_PREFERRED_TERM_OF", direction: "none" },
                { label: "Technology", identifier: "t" },
              ],
            })
            .match({
              optional: true,
              related: [
                { identifier: "t" },
                { name: "IS_SYNONYM_OF*", direction: "in" },
                { label: "Technology", identifier: "syn" },
              ],
            })
            .with(["pt", "COLLECT(syn) as synonyms", "t"]).return(`
              pt {
                .*,
                technology: t,
                synonyms: synonyms
              } as res
            `);
          const result = await query.run(neogma.queryRunner);
          return result.records.map(record =>
            new TechnologyPreferredTermEntity(
              record.get("res"),
            ).getProperties(),
          );
        },
        getPairedTerms: async function (): Promise<PairedTerm[]> {
          const query = new QueryBuilder()
            .match({
              related: [
                { label: "Technology", identifier: "t1" },
                { name: "IS_PAIRED_WITH", direction: "out" },
                { label: "TechnologyPairing" },
                { name: "IS_PAIRED_WITH", direction: "out" },
                { label: "Technology", identifier: "t2" },
              ],
            })
            .with(["t1", "COLLECT(DISTINCT PROPERTIES(t2)) as pairings"])
            .return(`
              {
                technology: PROPERTIES(t1),
                pairings: pairings
              } as res
            `);
          const result = await query.run(neogma.queryRunner);
          return result.records.map(record => record.get("res") as PairedTerm);
        },
        getAllowedTerms: async function (): Promise<Technology[]> {
          const results: Technology[] = [];
          const query = new QueryBuilder()
            .match({
              label: "Technology",
              identifier: "technology",
            })
            .raw("WHERE NOT (technology)<-[:IS_BLOCKED_TERM]-()")
            .return("technology");
          const result = await query.run(neogma.queryRunner);
          result.records.forEach(record =>
            results.push(
              this.buildFromRecord(record.get("technology")).getDataValues(),
            ),
          );
          return results;
        },
        getBlockedTerms: async function (): Promise<Technology[]> {
          const results: Technology[] = [];
          const allTechnologies = await this.findRelationships({
            alias: "blocked",
          });
          for (const technology of allTechnologies) {
            const isBlockedTerm = technology.target.__existsInDatabase;
            if (isBlockedTerm) {
              results.push(technology.source.getDataValues());
            }
          }
          return results;
        },
      },
    },
    neogma,
  );
