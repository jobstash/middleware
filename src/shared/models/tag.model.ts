import {
  BindParam,
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
import { TagEntity } from "../entities/tag.entity";

export type TagProps = ExtractProps<Tag>;

export type TagInstance = NeogmaInstance<TagProps, NoRelations, TagMethods>;

export interface TagMethods {
  isBlockedTag: () => Promise<boolean>;
}

export interface TagStatics {
  getPreferredTags: () => Promise<TagPreference[]>;
  getBlockedTags: () => Promise<Tag[]>;
  getUnblockedTags: () => Promise<Tag[]>;
  getPopularTags: (
    limit: number,
    threshold: number,
    ecosystem: string | undefined,
  ) => Promise<Tag[]>;
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
                synonyms: apoc.coll.toSet([(pt)-[:IS_SYNONYM_OF]-(t2) | t2 { .* }])
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
                pairings: apoc.coll.toSet([(t1)-[:IS_PAIR_OF]->(t2) | t2 { .* }])
              } as res
            `);
          const result = await query.run(neogma.queryRunner);
          return result.records.map(record => record.get("res") as TagPair);
        },
        getUnblockedTags: async function (): Promise<Tag[]> {
          const query = new QueryBuilder()
            .match({
              related: [
                { label: "Organization", identifier: "org" },
                {
                  name: "HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*4",
                  direction: "out",
                },
                {
                  label: "Tag",
                  identifier: "tag",
                },
                { name: "HAS_TAG_DESIGNATION", direction: "out" },
                { label: "AllowedDesignation|DefaultDesignation" },
              ],
            })
            .raw(
              "WHERE NOT (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)",
            )
            .raw(
              "OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(pair:Tag)",
            )
            .with("DISTINCT tag")
            .raw(
              "OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)",
            )
            .raw(
              "OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(pair:Tag)",
            )
            .with(
              "tag, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others",
            )
            .with(
              "CASE WHEN size(others) > 0 THEN head(others) ELSE tag END AS canonicalTag",
            )
            .with("DISTINCT canonicalTag AS tag")
            .return("tag");
          const result = await query.run(neogma.queryRunner);
          return result.records.map(x =>
            new TagEntity(x.get("tag")).getProperties(),
          );
        },
        getPopularTags: async function (
          limit: number,
          threshold: number,
        ): Promise<Tag[]> {
          const query = new QueryBuilder(
            new BindParam({ upperBound: threshold }),
          )
            .match({
              related: [
                { label: "Organization", identifier: "org" },
                {
                  name: "HAS_JOBSITE|HAS_JOBPOST|HAS_STRUCTURED_JOBPOST|HAS_TAG*4",
                  direction: "out",
                },
                {
                  label: "Tag",
                  identifier: "tag",
                },
                { name: "HAS_TAG_DESIGNATION", direction: "out" },
                { label: "AllowedDesignation|DefaultDesignation" },
              ],
            })
            .raw(
              "WHERE NOT (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)",
            )
            .with("DISTINCT tag")
            .raw(
              "OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(synonym:Tag)--(:PreferredDesignation)",
            )
            .raw(
              "OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(pair:Tag)",
            )
            .with(
              "tag, collect(DISTINCT synonym) + collect(DISTINCT pair) AS others",
            )
            .with(
              "CASE WHEN size(others) > 0 THEN head(others) ELSE tag END AS canonicalTag",
            )
            .with("DISTINCT canonicalTag AS tag")
            .match({
              related: [
                {
                  label: "StructuredJobpost",
                  identifier: "job",
                },
                {
                  direction: "out",
                  name: "HAS_TAG",
                },
                {
                  label: "Tag",
                  identifier: "tag",
                },
              ],
            })
            .where("(job)-[:HAS_STATUS]->(:JobpostOnlineStatus)")
            .with("tag, count(DISTINCT job) AS popularity")
            .where("popularity >= 1 AND popularity < $upperBound")
            .return("tag");
          const result = (await query.run(neogma.queryRunner)).records.map(x =>
            new TagEntity(x.get("tag")).getProperties(),
          );
          return limit ? result.slice(0, limit) : result;
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
