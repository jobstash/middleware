import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";
import { TagRepository } from "src/postgres/tag.repository";
import { TagEntity } from "src/shared/entities/tag.entity";
import NotFoundError from "src/shared/errors/not-found-error";
import { slugify } from "src/shared/helpers";
import {
  ResponseWithOptionalData,
  Tag,
  TagPair,
  TagPreference,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { BatchMatchTagsResult } from "./dto/batch-match-tags.output";
import { CreateTagDto } from "./dto/create-tag.dto";
import { UpdateTagDto } from "./dto/update-tag.dto";

@Injectable()
export class TagsService {
  private readonly logger = new CustomLogger(TagsService.name);

  constructor(
    private readonly tags: TagRepository,
    private readonly configService: ConfigService,
  ) {}

  async findAll(): Promise<Tag[]> {
    return this.tags.findAll();
  }

  async findById(id: string): Promise<TagEntity | undefined> {
    const tag = await this.tags.findById(id);
    return tag ? new TagEntity(tag) : undefined;
  }

  async findByNormalizedName(
    normalizedName: string,
  ): Promise<TagEntity | null> {
    const tag = await this.tags.findByNormalizedName(normalizedName);
    return tag ? new TagEntity(tag) : undefined;
  }

  async findPreferredTagByNormalizedName(
    normalizedPreferredName: string,
  ): Promise<TagPreference | null> {
    const preference = await this.tags.findPreferredTag(
      normalizedPreferredName,
    );
    return preference ? new TagPreference(preference) : null;
  }

  async findBlockedTagByNormalizedName(
    normalizedName: string,
  ): Promise<TagEntity | null> {
    const tag = await this.tags.findBlockedTag(normalizedName);
    return tag ? new TagEntity(tag) : null;
  }

  async getAllUnblockedTags(): Promise<Tag[]> {
    try {
      return await this.tags.getUnblockedTags();
    } catch (error) {
      this.captureDatabaseError("getAllUnblockedTags", error);
      return undefined;
    }
  }

  async getPopularTags(limit: number): Promise<Tag[]> {
    try {
      return await this.tags.getPopularTags(
        limit,
        this.configService.get<number>("SKILL_THRESHOLD") ??
          Number.MAX_SAFE_INTEGER,
      );
    } catch (error) {
      this.captureDatabaseError("getPopularTags", error);
      return undefined;
    }
  }

  async getBlockedTags(): Promise<Tag[]> {
    try {
      return await this.tags.getTagsByDesignation("BlockedDesignation");
    } catch (error) {
      this.captureDatabaseError("getBlockedTags", error);
      return undefined;
    }
  }

  async getPreferredTags(): Promise<TagPreference[]> {
    try {
      return (await this.tags.getPreferredTags()).map(
        preference => new TagPreference(preference),
      );
    } catch (error) {
      this.captureDatabaseError("getPreferredTags", error);
      return undefined;
    }
  }

  async getPairedTags(): Promise<TagPair[]> {
    try {
      return await this.tags.getPairedTags();
    } catch (error) {
      this.captureDatabaseError("getPairedTags", error);
      return undefined;
    }
  }

  async create(dto: CreateTagDto, creatorWallet: string): Promise<TagEntity> {
    return new TagEntity(await this.tags.createTag(dto, creatorWallet));
  }

  async blockTag(
    normalizedName: string,
    creatorWallet: string,
  ): Promise<TagEntity> {
    const tag = await this.tags.setDesignation({
      normalizedName,
      designation: "BlockedDesignation",
      creatorWallet,
      includeSynonyms: true,
      replaceAllowed: true,
    });
    if (!tag) throw new NotFoundError("Tag not found");
    return new TagEntity(tag);
  }

  async preferTag(
    normalizedName: string,
    creatorWallet: string,
  ): Promise<TagEntity> {
    const tag = await this.tags.setDesignation({
      normalizedName,
      designation: "PreferredDesignation",
      creatorWallet,
    });
    if (!tag) throw new NotFoundError("Tag not found");
    return new TagEntity(tag);
  }

  async unpreferTag(normalizedName: string): Promise<boolean> {
    await this.tags.removeDesignation(normalizedName, "PreferredDesignation");
    return true;
  }

  async hasBlockedRelation(normalizedName: string): Promise<boolean> {
    return this.tags.hasDesignation(normalizedName, "BlockedDesignation");
  }

  async hasPreferredRelation(normalizedName: string): Promise<boolean> {
    return this.tags.hasDesignation(normalizedName, "PreferredDesignation");
  }

  async hasRelationToPreferredTag(
    preferredNormalizedName: string,
    synonymNormalizedName: string,
  ): Promise<boolean> {
    if (
      !(await this.tags.hasDesignation(
        preferredNormalizedName,
        "PreferredDesignation",
      ))
    ) {
      return false;
    }
    return this.tags.areSynonymConnected(
      preferredNormalizedName,
      synonymNormalizedName,
    );
  }

  async hasPreferredTagCreatorRelationship(
    preferredNormalizedName: string,
    wallet: string,
  ): Promise<boolean> {
    return this.tags.hasDesignation(
      preferredNormalizedName,
      "PreferredDesignation",
      wallet,
    );
  }

  async hasBlockedTagCreatorRelationship(
    blockedNormalizedName: string,
    wallet: string,
  ): Promise<boolean> {
    return this.tags.hasDesignation(
      blockedNormalizedName,
      "BlockedDesignation",
      wallet,
    );
  }

  async relatePreferredTagToTag(
    preferredNormalizedName: string,
    synonymNormalizedName: string,
  ): Promise<boolean> {
    const linked = await this.tags.connectSynonyms(
      preferredNormalizedName,
      synonymNormalizedName,
      undefined,
      true,
    );
    return linked.length === 2;
  }

  async getSynonymPreferredTag(
    synonymNormalizedName: string,
  ): Promise<TagPreference | undefined> {
    try {
      const preference = await this.tags.getPreferredForSynonym(
        synonymNormalizedName,
      );
      return preference ? new TagPreference(preference) : undefined;
    } catch (error) {
      this.captureDatabaseError("getSynonymPreferredTag", error);
      return undefined;
    }
  }

  async relatePairedTags(
    normalizedOriginTagName: string,
    normalizedPairTagNameList: string[],
    creatorWallet: string,
  ): Promise<boolean> {
    try {
      return await this.tags.replacePairings(
        normalizedOriginTagName,
        normalizedPairTagNameList,
        creatorWallet,
      );
    } catch (error) {
      this.captureDatabaseError("relatePairedTags", error);
      return false;
    }
  }

  async relateTagToStructuredJobpost(
    tagId: string,
    structuredJobpostId: string,
  ): Promise<Tag> {
    if (!(await this.tags.findById(tagId))) {
      throw new NotFoundError("Tag not found");
    }
    const tag = await this.tags.linkTagToJob(tagId, structuredJobpostId);
    if (!tag) {
      throw new NotFoundError("StructuredJobpost not found");
    }
    return new Tag(tag);
  }

  async unrelatePreferredTagToTag(
    preferredNormalizedName: string,
    synonymNormalizedName: string,
  ): Promise<void> {
    await this.tags.disconnectSynonyms(
      preferredNormalizedName,
      synonymNormalizedName,
    );
  }

  async unblockTag(normalizedName: string, wallet: string): Promise<boolean> {
    if (!(await this.tags.findByNormalizedName(normalizedName))) {
      throw new NotFoundError("Tag not found");
    }
    await this.tags.removeDesignation(
      normalizedName,
      "BlockedDesignation",
      true,
    );
    await this.tags.setDesignation({
      normalizedName,
      designation: "AllowedDesignation",
      creatorWallet: wallet,
      includeSynonyms: true,
    });
    return true;
  }

  async linkSynonyms(
    originTagNormalizedName: string,
    synonymNormalizedName: string,
    synonymSuggesterWallet: string,
  ): Promise<Tag[]> {
    const tags = await this.tags.connectSynonyms(
      originTagNormalizedName,
      synonymNormalizedName,
      synonymSuggesterWallet,
    );
    if (!tags.length) {
      throw new NotFoundError(
        `Could not link synonym Tags ${originTagNormalizedName} and ${synonymNormalizedName}`,
      );
    }
    return tags;
  }

  async unlinkSynonyms(
    originTagNormalizedName: string,
    synonymNormalizedName: string,
    _synonymSuggesterWallet: string,
  ): Promise<Tag[]> {
    const first = await this.tags.findByNormalizedName(originTagNormalizedName);
    const second = await this.tags.findByNormalizedName(synonymNormalizedName);
    if (!first || !second) return [];
    return (await this.tags.disconnectSynonyms(
      originTagNormalizedName,
      synonymNormalizedName,
    ))
      ? [first, second]
      : [];
  }

  async update(id: string, properties: UpdateTagDto): Promise<Tag> {
    const tag = await this.tags.updateTag(id, { ...properties });
    if (!tag) throw new NotFoundError("Tag not found");
    return new TagEntity(tag).getProperties();
  }

  async deleteById(id: string): Promise<boolean> {
    try {
      return await this.tags.deleteTag(id);
    } catch (error) {
      this.captureDatabaseError("deleteById", error);
      return false;
    }
  }

  normalizeTagName(name: string): string {
    return slugify(name);
  }

  async matchTags(tags: string[]): Promise<
    ResponseWithOptionalData<{
      recognized_tags: string[];
      unrecognized_tags: string[];
    }>
  > {
    try {
      const matches = await this.tags.fuzzyMatches(tags, 5, false);
      const bestByInput = new Map<string, (typeof matches)[number]>();
      for (const match of matches) {
        const current = bestByInput.get(match.input);
        if (!current || match.score > current.score) {
          bestByInput.set(match.input, match);
        }
      }
      const recognizedTags: string[] = [];
      const unrecognizedTags: string[] = [];
      for (const input of tags) {
        const match = bestByInput.get(input);
        if (match) recognizedTags.push(match.name);
        else unrecognizedTags.push(input);
      }
      return {
        success: true,
        message: "Matched tags successfully",
        data: {
          recognized_tags: recognizedTags,
          unrecognized_tags: unrecognizedTags,
        },
      };
    } catch (error) {
      this.captureDatabaseError("matchTags", error);
      return { success: false, message: this.errorMessage(error) };
    }
  }

  async searchTags(query: string): Promise<Tag[]> {
    try {
      const matches = await this.tags.fuzzyMatches([query], 20, true);
      return [...matches]
        .sort((first, second) => second.score - first.score)
        .map(
          ({ input: _input, score: _score, jobCount: _jobCount, ...tag }) =>
            new Tag(tag),
        );
    } catch (error) {
      this.captureDatabaseError("searchTags", error);
      return [];
    }
  }

  async batchMatchTags(
    tags: string[],
    scoreThreshold = 0.5,
    maxResults = 15,
  ): Promise<ResponseWithOptionalData<BatchMatchTagsResult[]>> {
    try {
      if (!tags.length) return this.emptyBatchResult();

      const searchInputs = [
        ...new Set(
          tags.flatMap(tag => {
            const parts = tag
              .split(/[\s/\-_,;|]+/)
              .map(part => slugify(part))
              .filter(Boolean);
            if (!parts.length) return [];
            return parts.length > 1 ? [tag, parts.join("")] : [tag];
          }),
        ),
      ];
      if (!searchInputs.length) return this.emptyBatchResult();

      const matches = await this.tags.fuzzyMatches(searchInputs, 5, true);
      const candidates = new Map<string, BatchMatchTagsResult>();
      for (const match of matches) {
        if (match.score < scoreThreshold) continue;
        const current = candidates.get(match.id);
        if (!current || match.score > current.score) {
          candidates.set(match.id, {
            id: match.id,
            name: match.name,
            normalizedName: match.normalizedName,
            score: match.score,
          });
        }
      }

      let ranked = [...candidates.values()];
      if (ranked.length >= 3) {
        const cooccurrence = await this.tags.getCooccurrence(
          ranked.map(candidate => candidate.id),
        );
        const fallback = [...ranked]
          .sort((first, second) => second.score - first.score)
          .slice(0, 5);
        const connected = ranked.filter(
          candidate => (cooccurrence.get(candidate.id) ?? 0) > 0,
        );
        if (connected.length) {
          const maxCooccurrence = Math.max(
            ...connected.map(candidate => cooccurrence.get(candidate.id) ?? 0),
          );
          ranked = connected.map(candidate => ({
            ...candidate,
            score:
              candidate.score *
              (0.4 +
                (0.6 * (cooccurrence.get(candidate.id) ?? 0)) /
                  maxCooccurrence),
          }));
        } else {
          ranked = fallback;
        }
      }

      return {
        success: true,
        message: "Batch matched tags successfully",
        data: ranked
          .sort((first, second) => second.score - first.score)
          .slice(0, Math.max(0, maxResults)),
      };
    } catch (error) {
      this.captureDatabaseError("batchMatchTags", error);
      return { success: false, message: this.errorMessage(error) };
    }
  }

  private emptyBatchResult(): ResponseWithOptionalData<BatchMatchTagsResult[]> {
    return {
      success: true,
      message: "Batch matched tags successfully",
      data: [],
    };
  }

  private captureDatabaseError(method: string, error: unknown): void {
    Sentry.withScope(scope => {
      scope.setTags({ action: "db-call", source: "tags.service" });
      Sentry.captureException(error);
    });
    this.logger.error(`TagsService::${method} ${this.errorMessage(error)}`);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
