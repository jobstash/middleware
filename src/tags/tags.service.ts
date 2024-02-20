import { Injectable } from "@nestjs/common";
import {
  TagPair,
  Tag,
  TagPreference,
  ResponseWithOptionalData,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { ModelService } from "src/model/model.service";
import { CreateTagDto } from "./dto/create-tag.dto";
import { InjectConnection } from "nest-neogma";
import { Neogma } from "neogma";
import { UpdateTagDto } from "./dto/update-tag.dto";
import { TagEntity } from "src/shared/entities/tag.entity";
import NotFoundError from "src/shared/errors/not-found-error";
import { instanceToNode, normalizeString } from "src/shared/helpers";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class TagsService {
  private readonly logger = new CustomLogger(TagsService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private models: ModelService,
    private readonly configService: ConfigService,
  ) {}

  async findAll(): Promise<Tag[]> {
    return this.models.Tags.findMany().then(res =>
      res.map(tag => new TagEntity(instanceToNode(tag)).getProperties()),
    );
  }

  async findById(id: string): Promise<TagEntity | undefined> {
    return this.models.Tags.findOne({
      where: {
        id,
      },
    }).then(res => (res ? new TagEntity(instanceToNode(res)) : undefined));
  }

  async findByNormalizedName(
    normalizedName: string,
  ): Promise<TagEntity | null> {
    return this.models.Tags.findOne({
      where: {
        normalizedName,
      },
    }).then(res => (res ? new TagEntity(instanceToNode(res)) : undefined));
  }

  async findPreferredTagByNormalizedName(
    normalizedPreferredName: string,
  ): Promise<TagPreference | null> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (pt:Tag {normalizedName: $normalizedPreferredName})-[:HAS_TAG_DESIGNATION]->(:PreferredDesignation)
        RETURN {
          tag: pt { .* },
          synonyms: apoc.coll.toSet([(pt)-[:IS_SYNONYM_OF]-(synonym: Tag) | synonym { .* }])
        } as res
      `,
      { normalizedPreferredName },
    );
    return res.records.length
      ? new TagPreference(res.records[0].get("res"))
      : null;
  }

  async findBlockedTagByNormalizedName(
    normalizedName: string,
  ): Promise<TagEntity | null> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (bt:Tag {normalizedName: $normalizedName})-[:HAS_TAG_DESIGNATION]->(:BlockedDesignation)
        RETURN bt
      `,
      { normalizedName },
    );
    return res.records.length ? new TagEntity(res.records[0].get("bt")) : null;
  }

  async getAllUnblockedTags(): Promise<Tag[]> {
    try {
      return this.models.Tags.getUnblockedTags(
        this.configService.get<number>("SKILL_THRESHOLD"),
      );
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "tags.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`TagsService::getAll ${err.message}`);
      return undefined;
    }
  }

  async getBlockedTags(): Promise<Tag[]> {
    try {
      return this.models.Tags.getBlockedTags();
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "tags.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`TagsService::getBlockedTags ${err.message}`);
      return undefined;
    }
  }

  async getPreferredTags(): Promise<TagPreference[]> {
    try {
      return this.models.Tags.getPreferredTags();
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "tags.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`TagsService::getPreferredTags ${err.message}`);
      return undefined;
    }
  }

  async getPairedTags(): Promise<TagPair[]> {
    try {
      return this.models.Tags.getPairedTags();
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "tags.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`TagsService::getPairedTags ${err.message}`);
      return undefined;
    }
  }

  async create(dto: CreateTagDto, creatorWallet: string): Promise<TagEntity> {
    return this.neogma.queryRunner
      .run(
        `
          MERGE (dd:DefaultDesignation {name: "DefaultDesignation"})
          CREATE (t:Tag { id: randomUUID() })-[r:HAS_TAG_DESIGNATION]->(dd)
          SET t += $properties
          SET r.creator = $creatorWallet
          SET r.timestamp = timestamp()
          RETURN t
        `,
        {
          properties: {
            ...dto,
          },
          creatorWallet,
        },
      )
      .then(res => new TagEntity(res.records[0].get("t")));
  }

  async blockTag(
    normalizedName: string,
    creatorWallet: string,
  ): Promise<TagEntity> {
    return this.neogma.queryRunner
      .run(
        `
          MERGE (bd:BlockedDesignation {name: "BlockedDesignation"})
          WITH bd
          MATCH (bt:Tag {normalizedName: $normalizedName})-[r1:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
          OPTIONAL MATCH (bt)-[:IS_SYNONYM_OF]-(st:Tag)-[r2:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
          DETACH DELETE r1, r2

          WITH bt, st, bd
          MERGE (bt)-[r3:HAS_TAG_DESIGNATION]->(bd)
          MERGE (st)-[r4:HAS_TAG_DESIGNATION]->(bd)
          SET r3.creator = $creatorWallet
          SET r3.timestamp = timestamp()
          SET r4.creator = $creatorWallet
          SET r4.timestamp = timestamp()
          RETURN bt
          `,
        {
          normalizedName,
          creatorWallet,
        },
      )
      .then(res => new TagEntity(res.records[0].get("bt")));
  }

  async preferTag(
    normalizedName: string,
    creatorWallet: string,
  ): Promise<TagEntity> {
    return this.neogma.queryRunner
      .run(
        `
          MERGE (pd:PreferredDesignation {name: "PreferredDesignation"})
          WITH pd
          MATCH (pt:Tag {normalizedName: $normalizedName})
          MERGE (pt)-[r:HAS_TAG_DESIGNATION]->(pd)
          SET r.creator = $creatorWallet
          SET r.timestamp = timestamp()
          RETURN pt
          `,
        {
          normalizedName,
          creatorWallet,
        },
      )
      .then(res => new TagEntity(res.records[0].get("pt")));
  }

  async unpreferTag(normalizedName: string): Promise<boolean> {
    await this.neogma.queryRunner.run(
      `
          MATCH (pt:Tag {normalizedName: $normalizedName})-[r:HAS_TAG_DESIGNATION]->(:PreferredDesignation)
          DELETE r
          `,
      {
        normalizedName,
      },
    );
    return true;
  }

  async hasBlockedRelation(normalizedName: string): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        RETURN EXISTS( (:Tag {normalizedName: $normalizedName})-[:HAS_TAG_DESIGNATION]->(:BlockedDesignation) ) AS result
        `,
      { normalizedName },
    );

    return (res.records[0]?.get("result") as boolean) ?? false;
  }

  async hasPreferredRelation(normalizedName: string): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        RETURN EXISTS( (:Tag {normalizedName: $normalizedName})-[:HAS_TAG_DESIGNATION]->(:PreferredDesignation) ) AS result
        `,
      { normalizedName },
    );

    return (res.records[0]?.get("result") as boolean) ?? false;
  }

  async hasRelationToPreferredTag(
    preferredNormalizedName: string,
    synonymNormalizedName: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (pt:Tag {normalizedName: $preferredNormalizedName})-[:HAS_TAG_DESIGNATION]->(:PreferredDesignation), (st:Tag {normalizedName: $synonymNormalizedName})
        RETURN EXISTS( (pt)-[:IS_SYNONYM_OF*]-(st) ) AS result
        `,
      { preferredNormalizedName, synonymNormalizedName },
    );

    return (res.records[0]?.get("result") as boolean) ?? false;
  }

  async hasPreferredTagCreatorRelationship(
    preferredNormalizedName: string,
    wallet: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (:Tag {normalizedName: $preferredNormalizedName})-[r:HAS_TAG_DESIGNATION]->(:PreferredDesignation)
        RETURN r.creator = $wallet AS result
        `,
      { preferredNormalizedName, wallet },
    );

    return (res.records[0]?.get("result") as boolean) ?? false;
  }

  async hasBlockedTagCreatorRelationship(
    blockedNormalizedName: string,
    wallet: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (:Tag {normalizedName: $blockedNormalizedName})-[r:HAS_TAG_DESIGNATION]->(:BlockedDesignation)
        RETURN r.creator = $wallet AS result
        `,
      { blockedNormalizedName, wallet },
    );

    return (res.records[0]?.get("result") as boolean) ?? false;
  }

  async relatePreferredTagToTag(
    preferredNormalizedName: string,
    synonymNormalizedName: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (pt:Tag {normalizedName: $preferredNormalizedName})-[:HAS_TAG_DESIGNATION]->(:PreferredDesignation), (t:Tag {normalizedName: $synonymNormalizedName})
        MERGE (pt)<-[r1:IS_SYNONYM_OF]-(t)
        SET r1.timestamp = timestamp()

        WITH pt, t
        OPTIONAL MATCH (st:Tag)-[:IS_SYNONYM_OF]-(t)
        WHERE st.id <> pt.id AND NOT (st)<-[:IS_SYNONYM_OF]-(pt)
        MERGE (pt)<-[r2:IS_SYNONYM_OF]-(st)
        SET r2.timestamp = timestamp()

        WITH pt, t
        OPTIONAL MATCH (st:Tag)-[:IS_SYNONYM_OF]-(pt)
        WHERE st.id <> t.id AND NOT (st)-[:IS_SYNONYM_OF]->(t)
        MERGE (t)<-[r3:IS_SYNONYM_OF]-(st)
        SET r3.timestamp = timestamp()

        WITH pt, t
        MERGE (t)<-[r4:IS_SYNONYM_OF]-(pt)
        SET r4.timestamp = timestamp()

        RETURN true as result;
        `,
      { preferredNormalizedName, synonymNormalizedName },
    );

    return res.records[0]?.get("result") as boolean;
  }

  async getSynonymPreferredTag(
    synonymNormalizedName: string,
  ): Promise<TagPreference | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (t:Tag {normalizedName: $synonymNormalizedName})-[:IS_SYNONYM_OF]->(pt:Tag)-[:HAS_TAG_DESIGNATION]->(:PreferredDesignation)
        RETURN pt {
          tag: pt { .* },
          synonyms: apoc.coll.toSet([(pt)-[:IS_SYNONYM_OF]-(t2) | t2 { .* }])
        } as res
        `,
      { synonymNormalizedName },
    );

    return res.records[0]?.get("res")
      ? new TagPreference(res.records[0]?.get("res") as TagPreference)
      : undefined;
  }

  async relatePairedTags(
    normalizedOriginTagName: string,
    normalizedPairTagNameList: string[],
    creatorWallet: string,
  ): Promise<boolean> {
    try {
      await this.neogma.queryRunner.run(
        `
          MERGE (pd:PairedDesignation {name: "PairedDesignation"})
          WITH pd
          MATCH (t1:Tag {normalizedName: $normalizedOriginTagName})
          MERGE (t1)-[:HAS_TAG_DESIGNATION]->(pd)

          WITH t1

          OPTIONAL MATCH (t1)-[r:IS_PAIR_OF]->(t2)
          DETACH DELETE r

          WITH t1
          
          UNWIND $normalizedPairTagNameList AS pairTagNormalizedName
          MATCH (t2:Tag {normalizedName: pairTagNormalizedName})

          CREATE (t1)-[p:IS_PAIR_OF]->(t2)
          SET p.timestamp = timestamp()
          SET p.creator = $creatorWallet
        `,
        {
          normalizedOriginTagName,
          normalizedPairTagNameList,
          creatorWallet,
        },
      );
      return true;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "tags.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`TagsService::relatePairedTags ${err.message}`);
      return false;
    }
  }

  async relateTagToStructuredJobpost(
    tagId: string,
    structuredJobpostId: string,
  ): Promise<Tag> {
    const tag = await this.neogma.queryRunner.run(
      `
            MATCH (t:Tag { id: $tagId })
            RETURN t
        `,
      { tagId },
    );
    if (!tag.records.length) {
      throw new NotFoundError("Tag not found");
    }
    const structuredJobpost = await this.neogma.queryRunner.run(
      `
            MATCH (sj:StructuredJobpost { id: $structuredJobpostId })
            RETURN sj
        `,
      { structuredJobpostId },
    );
    if (!structuredJobpost.records.length) {
      throw new NotFoundError("StructuredJobpost not found");
    }
    const res = await this.neogma.queryRunner.run(
      `
          MATCH (t:Tag { id: $tagId })
          MATCH (sj:StructuredJobpost { id: $structuredJobpostId })
          
          CREATE (sj)-[r:HAS_TAG]->(t)
          
          SET r.timestamp = timestamp()
          SET r.originatingJobpostId = $structuredJobpostId

          RETURN t {
            .*,
          } AS Tag
      `,
      { tagId, structuredJobpostId },
    );

    if (res.records.length === 0) {
      throw new NotFoundError(
        `Could not create relationship between StructuredJobpost ${structuredJobpostId} to Tag ${tagId}`,
      );
    }

    const [first] = res.records;
    const tagData = first.get("Tag");
    return new Tag(tagData);
  }

  async unrelatePreferredTagToTag(
    preferredNormalizedName: string,
    synonymNormalizedName: string,
  ): Promise<void> {
    await this.neogma.queryRunner.run(
      `
      MATCH (pt:Tag {normalizedName: $preferredNormalizedName})-[:HAS_TAG_DESIGNATION]->(:PreferredDesignation), (t:Tag {normalizedName: $synonymNormalizedName})
      MATCH (pt)<-[r1:IS_SYNONYM_OF]-(t)
      DELETE r1

      WITH pt, t
      OPTIONAL MATCH (st:Tag)-[:IS_SYNONYM_OF]-(t)
      WHERE st.id <> pt.id AND NOT (st)<-[:IS_SYNONYM_OF]-(pt)
      MATCH (pt)<-[r2:IS_SYNONYM_OF]-(st)
      DELETE r2

      WITH pt, t
      OPTIONAL MATCH (st:Tag)-[:IS_SYNONYM_OF]-(pt)
      MATCH (t)-[r3:IS_SYNONYM_OF]-(st)
      DELETE r3

      WITH pt, t
      MERGE (t)-[r4:IS_SYNONYM_OF]-(pt)
      DELETE r4

      RETURN true as result;
      `,
      { preferredNormalizedName, synonymNormalizedName },
    );

    return;
  }

  async unblockTag(normalizedName: string, wallet: string): Promise<boolean> {
    await this.neogma.queryRunner.run(
      `
        MATCH (tag:Tag {normalizedName: $normalizedName})-[r1:HAS_TAG_DESIGNATION]->(:BlockedDesignation)
        OPTIONAL MATCH (st:Tag)<-[:IS_SYNONYM_OF]-(tag)
        OPTIONAL MATCH (st)-[r2:HAS_TAG_DESIGNATION]->(:BlockedDesignation)
        DETACH DELETE r1, r2

        MERGE (ad:AllowedDesignation {name: "AllowedDesignation"})
        WITH ad, tag
        CREATE (tag)-[nr1:HAS_TAG_DESIGNATION]->(ad)
        SET nr1.creator = $wallet
        SET nr1.timestamp = timestamp()
        
        WITH ad, tag
        OPTIONAL MATCH (st:Tag)<-[:IS_SYNONYM_OF]-(tag)
        CREATE (st)-[nr2:HAS_TAG_DESIGNATION]->(ad)
        SET nr2.creator = $wallet
        SET nr2.timestamp = timestamp()
      `,
      { normalizedName, wallet },
    );

    return;
  }

  async linkSynonyms(
    originTagNormalizedName: string,
    synonymNormalizedName: string,
    synonymSuggesterWallet: string,
  ): Promise<Tag[]> {
    const res = await this.neogma.queryRunner.run(
      `
      MATCH (t1:Tag {normalizedName: $originTagNormalizedName}), (t2:Tag {normalizedName: $synonymNormalizedName})
      
      CREATE (t1)<-[ts:IS_SYNONYM_OF]-(t2)

      SET ts.timestamp = timestamp()
      SET ts.synonymNodeId = $secondTagNodeId
      SET ts.creator = $synonymSuggesterWallet

      OPTIONAL MATCH (ty)-[:IS_SYNONYM_OF]-(t2)

      MERGE (ty)-[:IS_SYNONYM_OF]->(t1)

      WITH t1, t2

      RETURN t1, t2
      `,
      {
        originTagNormalizedName,
        synonymNormalizedName,
        synonymSuggesterWallet,
      },
    );

    if (res.records.length === 0) {
      throw new NotFoundError(
        `Could not link synonym Tags ${originTagNormalizedName} and ${synonymNormalizedName}`,
      );
    }

    const [first, second] = res.records;
    const firstNode = new Tag(first.get("t1"));
    const secondNode = new Tag(second.get("t2"));

    return [firstNode, secondNode];
  }

  async unlinkSynonyms(
    originTagNormalizedName: string,
    synonymNormalizedName: string,
    synonymSuggesterWallet: string,
  ): Promise<Tag[]> {
    await this.neogma.queryRunner.run(
      `
        MATCH (t1:Tag {normalizedName: $originTagNormalizedName})-[syn:IS_SYNONYM_OF]-(t2:Tag {normalizedName: $synonymNormalizedName})
        DETACH DELETE syn
      `,
      {
        originTagNormalizedName,
        synonymNormalizedName,
        synonymSuggesterWallet,
      },
    );

    return;
  }

  async update(id: string, properties: UpdateTagDto): Promise<Tag> {
    return this.models.Tags.update(properties, {
      where: {
        id: id,
      },
      return: true,
    }).then(res => new Tag(res[0][0].getDataValues()));
  }

  async deleteById(id: string): Promise<boolean> {
    await this.models.Tags.delete({
      where: {
        id: id,
      },
    });
    return true;
  }

  normalizeTagName(name: string): string {
    return normalizeString(name);
  }

  async matchTags(tags: string[]): Promise<
    ResponseWithOptionalData<{
      recognized_tags: string[];
      unrecognized_tags: string[];
    }>
  > {
    try {
      const recognizedTags = [];
      const unrecognizedTags = [];
      for (const tag of tags) {
        const result = await this.neogma.queryRunner.run(
          `
          CALL db.index.fulltext.queryNodes("tagNames", $query) YIELD node as tag, score
          WHERE NOT (tag)-[:IS_PAIR_OF|IS_SYNONYM_OF]-(:Tag)--(:BlockedDesignation) AND NOT (tag)-[:HAS_TAG_DESIGNATION]-(:BlockedDesignation)
          OPTIONAL MATCH (tag)-[:IS_SYNONYM_OF]-(other:Tag)--(:PreferredDesignation)
          WITH (CASE WHEN other IS NULL THEN tag ELSE other END) AS tag, score
          OPTIONAL MATCH (:PairedDesignation)<-[:HAS_TAG_DESIGNATION]-(tag)-[:IS_PAIR_OF]->(other:Tag)
          WITH (CASE WHEN other IS NULL THEN tag ELSE other END) AS node, score
          RETURN node.name as name, score
          ORDER BY score DESC

          `,
          { query: `name:${tag}~` },
        );
        const mostMatching = result.records[0]?.get("name");
        if (mostMatching) {
          recognizedTags.push(mostMatching);
        } else {
          unrecognizedTags.push(tag);
        }
      }
      return {
        success: true,
        message: "Matched tags successfully",
        data: {
          recognized_tags: recognizedTags,
          unrecognized_tags: unrecognizedTags,
        },
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "tags.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`TagsService::matchTags ${err.message}`);
      return { success: false, message: err.message };
    }
  }
}
