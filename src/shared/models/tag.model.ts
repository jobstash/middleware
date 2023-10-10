import {
  ModelFactory,
  Neogma,
  NeogmaInstance,
  NeogmaModel,
  QueryBuilder,
} from "neogma";
import {
  ExtractProps,
  TagPair,
  Tag,
  TagPreference,
  NoRelations,
} from "../types";
import { boolean } from "fp-ts";

export type TagProps = ExtractProps<Tag>;

export type TagInstance = NeogmaInstance<TagProps, NoRelations, TagMethods>;

// export interface NoRelations {}
export interface TagMethods {
  isBlockedTag: () => Promise<boolean>;
}

export interface TagStatics {
  getPreferredTags: () => Promise<TagPreference[]>;
  getBlockedTags: () => Promise<Tag[]>;
  getAllowedTags: () => Promise<Tag[]>;
  getPairedTags: () => Promise<TagPair[]>;
}

export const Tags = (
  neogma: Neogma,
): NeogmaModel<TagProps, NoRelations, TagMethods, TagStatics> =>
  ModelFactory<TagProps, NoRelations, TagStatics, TagMethods>(
    {
      label: "Tag",
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

      methods: {
        isBlockedTag: async function (): Promise<boolean> {
          const query = `
            RETURN EXISTS( (:Tag {id: $id})-[:HAS_TAG_DESIGNATION]->(:BlockedTag) )
          `;
          const result = await neogma.queryRunner.run(query, { id: this.id });
          return result.records[0]?.get("blocked") as boolean;
        },
      },
      statics: {
        getPreferredTags: async function (): Promise<TagPreference[]> {
          const query = new QueryBuilder()
            .match({
              label: "PreferredTag",
              identifier: "pt",
            })
            .match({
              optional: true,
              related: [
                { identifier: "pt" },
                { name: "IS_PREFERRED_TERM_OF", direction: "none" },
                { label: "Tag", identifier: "t" },
              ],
            })
            .match({
              optional: true,
              related: [
                { identifier: "t" },
                { name: "IS_SYNONYM_OF*", direction: "in" },
                { label: "Tag", identifier: "syn" },
              ],
            })
            .with(["pt", "COLLECT(syn) as synonyms", "t"]).return(`
              pt {
                .*,
                tag: t,
                synonyms: synonyms
              } as res
            `);
          const result = await query.run(neogma.queryRunner);
          return result.records.map(
            record => new TagPreference(record.get("res")),
          );
        },
        getPairedTags: async function (): Promise<TagPair[]> {
          const query = new QueryBuilder()
            .match({
              related: [
                { label: "Tag", identifier: "t1" },
                { name: "IS_PAIRED_WITH", direction: "out" },
                { label: "TagPairing" },
                { name: "IS_PAIRED_WITH", direction: "out" },
                { label: "Tag", identifier: "t2" },
              ],
            })
            .with(["t1", "COLLECT(DISTINCT PROPERTIES(t2)) as pairings"])
            .return(`
              {
                tag: PROPERTIES(t1),
                pairings: pairings
              } as res
            `);
          const result = await query.run(neogma.queryRunner);
          return result.records.map(record => record.get("res") as TagPair);
        },
        getAllowedTags: async function (): Promise<Tag[]> {
          const results: Tag[] = [];
          const query = new QueryBuilder()
            .match({
              label: "Tag",
              identifier: "tag",
            })
            .raw("WHERE NOT (tag)<-[:HAS_TAG_DESIGNATION]-()")
            .return("tag");
          const result = await query.run(neogma.queryRunner);
          result.records.forEach(record =>
            results.push(
              this.buildFromRecord(record.get("tag")).getDataValues(),
            ),
          );
          return results;
        },
        getBlockedTags: async function (): Promise<Tag[]> {
          const results: Tag[] = [];
          const allTechnologies = await this.findRelationships({
            alias: "blocked",
          });
          for (const tag of allTechnologies) {
            const isBlockedTag = tag.target.__existsInDatabase;
            if (isBlockedTag) {
              results.push(tag.source.getDataValues());
            }
          }
          return results;
        },
      },
    },
    neogma,
  );
