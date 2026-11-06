import { TagsController } from "./tags.controller";
import { EMPTY_SESSION_OBJECT } from "src/shared/constants";

interface FixtureTag {
  getNormalizedName(): string;
  getProperties(): { name: string; normalizedName: string };
}

function fixture(): {
  tags: Record<string, jest.Mock>;
  preferred: {
    tag: { name: string };
    synonyms: { name: string; normalizedName: string }[];
  };
  controller: TagsController;
} {
  const node = (name: string): FixtureTag => ({
    getNormalizedName: () => name,
    getProperties: () => ({ name, normalizedName: name }),
  });
  const preferred = {
    tag: { name: "preferred" },
    synonyms: [{ name: "known", normalizedName: "known" }],
  };
  const tags = {
    normalizeTagName: jest.fn((name: string) => name),
    findByNormalizedName: jest.fn(async (name: string) => node(name)),
    hasPreferredRelation: jest.fn().mockResolvedValue(true),
    getSynonymPreferredTag: jest.fn().mockResolvedValue(undefined),
    findPreferredTagByNormalizedName: jest.fn().mockResolvedValue(preferred),
    preferTag: jest.fn(),
    relatePreferredTagToTag: jest.fn(),
  };
  return {
    tags,
    preferred,
    controller: new TagsController(tags as never, {} as never),
  };
}

describe("preferred tag mutation sequencing", () => {
  it("does not relink an existing synonym but still verifies the tag exists", async () => {
    const { tags, preferred, controller } = fixture();
    await expect(
      controller.createPreferredTag(EMPTY_SESSION_OBJECT, {
        preferredName: "preferred",
        synonyms: ["known"],
      }),
    ).resolves.toMatchObject({ success: true, data: preferred });
    expect(tags.findByNormalizedName.mock.calls).toEqual([
      ["preferred"],
      ["known"],
    ]);
    expect(tags.hasPreferredRelation).toHaveBeenCalledTimes(1);
    expect(tags.relatePreferredTagToTag).not.toHaveBeenCalled();
    expect(tags.preferTag).not.toHaveBeenCalled();
  });

  it("rejects turning an existing synonym into a preferred term without mutations", async () => {
    const { tags, controller } = fixture();
    tags.hasPreferredRelation.mockResolvedValue(false);
    tags.getSynonymPreferredTag.mockResolvedValue({ tag: { name: "another" } });
    await expect(
      controller.createPreferredTag(EMPTY_SESSION_OBJECT, {
        preferredName: "preferred",
        synonyms: ["known"],
      }),
    ).resolves.toMatchObject({ success: false });
    expect(tags.preferTag).not.toHaveBeenCalled();
    expect(tags.relatePreferredTagToTag).not.toHaveBeenCalled();
    expect(tags.findByNormalizedName).toHaveBeenCalledTimes(1);
  });
});
