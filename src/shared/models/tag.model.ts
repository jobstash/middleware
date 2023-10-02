import {
  ModelFactory,
  ModelRelatedNodesI,
  Neogma,
  NeogmaInstance,
  NeogmaModel,
  QueryBuilder,
} from "neogma";
import { ExtractProps, PairedTag, Tag, PreferredTag } from "../types";
import { BlockedTagInstance, BlockedTags } from "./blocked-tag.model";
import { PreferredTagEntity } from "../entities/preferred-tag.entity";

export type TagProps = ExtractProps<Tag>;

export type TagInstance = NeogmaInstance<TagProps, TagRelations, TagMethods>;

export interface TagRelations {
  blocked: ModelRelatedNodesI<
    ReturnType<typeof BlockedTags>,
    BlockedTagInstance
  >;
}
export interface TagMethods {
  isBlockedTag: () => Promise<boolean>;
}

export interface TagStatics {
  getPreferredTags: () => Promise<PreferredTag[]>;
  getBlockedTags: () => Promise<Tag[]>;
  getAllowedTags: () => Promise<Tag[]>;
  getPairedTags: () => Promise<PairedTag[]>;
}

export const Tags = (
  neogma: Neogma,
): NeogmaModel<TagProps, TagRelations, TagMethods, TagStatics> =>
  ModelFactory<TagProps, TagRelations, TagStatics, TagMethods>(
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
      relationships: {
        blocked: {
          model: BlockedTags(neogma),
          name: "IS_BLOCKED_TAG",
          direction: "in",
        },
      },
      methods: {
        isBlockedTag: async function (this: TagInstance): Promise<boolean> {
          const blocked = await this.findRelationships({
            alias: "blocked",
            limit: 1,
          });
          return blocked[0].target.__existsInDatabase;
        },
      },
      statics: {
        getPreferredTags: async function (): Promise<PreferredTag[]> {
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
          return result.records.map(record =>
            new PreferredTagEntity(record.get("res")).getProperties(),
          );
        },
        getPairedTags: async function (): Promise<PairedTag[]> {
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
          return result.records.map(record => record.get("res") as PairedTag);
        },
        getAllowedTags: async function (): Promise<Tag[]> {
          const results: Tag[] = [];
          const query = new QueryBuilder()
            .match({
              label: "Tag",
              identifier: "tag",
            })
            .raw("WHERE NOT (tag)<-[:IS_BLOCKED_TERM]-()")
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
