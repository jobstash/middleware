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

export type TagProps = ExtractProps<Tag>;

export type TagInstance = NeogmaInstance<TagProps, NoRelations, TagMethods>;

// export interface NoRelations {}
export interface TagMethods {
  isBlockedTag: () => Promise<boolean>;
}

export interface TagStatics {
  getPreferredTags: () => Promise<TagPreference[]>;
  getBlockedTags: () => Promise<Tag[]>;
  getUnblockedTags: () => Promise<Tag[]>;
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
            RETURN EXISTS( (:Tag {id: $id})-[:HAS_TAG_DESIGNATION]->(:BlockedDesignation) ) as blocked
          `;
          const result = await neogma.queryRunner.run(query, { id: this.id });
          return result.records[0]?.get("blocked") as boolean;
        },
      },
      statics: {
        getPreferredTags: async function (): Promise<TagPreference[]> {
          const query = new QueryBuilder().match({
            optional: true,
            related: [
              { label: "Tag", identifier: "pt" },
              { name: "HAS_TAG_DESIGNATION", direction: "out" },
              { label: "PreferredDesignation" },
            ],
          }).return(`
              pt {
                tag: pt { .* },
                synonyms: [(pt)<-[:IS_SYNONYM_OF*]-(t2) | t2 { .* }]
              } as res
            `);
          const result = await query.run(neogma.queryRunner);
          return result.records[0]?.get("res")
            ? result.records.map(record => new TagPreference(record.get("res")))
            : [];
        },
        getPairedTags: async function (): Promise<TagPair[]> {
          const query = new QueryBuilder().match({
            related: [
              { label: "Tag", identifier: "t1" },
              { name: "HAS_TAG_DESIGNATION", direction: "out" },
              { label: "PairedDesignation" },
            ],
          }).return(`
              t1 {
                tag: t1 { .* },
                pairings: [(t1)-[:IS_PAIR_OF]->(t2) | t2 { .* }]
              } as res
            `);
          const result = await query.run(neogma.queryRunner);
          return result.records.map(record => record.get("res") as TagPair);
        },
        getUnblockedTags: async function (): Promise<Tag[]> {
          const query = new QueryBuilder()
            .match({
              related: [
                {
                  label: "Tag",
                  identifier: "tag",
                },
                { name: "HAS_TAG_DESIGNATION", direction: "out" },
                { label: "AllowedDesignation|DefaultDesignation" },
              ],
            })
            .return("tag");
          const result = await query.run(neogma.queryRunner);
          return result.records.map(record =>
            this.buildFromRecord(record.get("tag")).getDataValues(),
          );
        },
        getBlockedTags: async function (): Promise<Tag[]> {
          const query = new QueryBuilder()
            .match({
              related: [
                {
                  label: "Tag",
                  identifier: "tag",
                },
                { name: "HAS_TAG_DESIGNATION", direction: "out" },
                { label: "BlockedDesignation" },
              ],
            })
            .return("tag");
          const result = await query.run(neogma.queryRunner);
          return result.records.map(record =>
            this.buildFromRecord(record.get("tag")).getDataValues(),
          );
        },
      },
    },
    neogma,
  );
