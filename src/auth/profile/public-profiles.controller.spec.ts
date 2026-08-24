import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ProfileRepository } from "src/postgres/profile.repository";
import { PublicProfilesController } from "./public-profiles.controller";

describe("PublicProfilesController", () => {
  it("exposes a normalized, super-admin-only paginated Profile grid", async () => {
    const repository = {
      getEntityProfilesForAdminGrid: jest.fn().mockResolvedValue({
        data: [{ id: "profile-one", slug: "acme" }],
        total: 1,
      }),
    };
    const controller = new PublicProfilesController(
      repository as unknown as ProfileRepository,
    );

    await expect(
      controller.getProfilesForAdminGrid(
        "9999",
        "-2",
        "  Acme  ",
        "  org-one  ",
        "Organization",
      ),
    ).resolves.toEqual({
      success: true,
      message: "Retrieved the Profile grid successfully",
      data: [{ id: "profile-one", slug: "acme" }],
      total: 1,
    });
    expect(repository.getEntityProfilesForAdminGrid).toHaveBeenCalledWith({
      limit: 500,
      offset: 0,
      query: "Acme",
      childId: "org-one",
      childType: "Organization",
    });
    expect(
      Reflect.getMetadata(
        "permissions",
        PublicProfilesController.prototype.getProfilesForAdminGrid,
      ),
    ).toEqual(["SUPER_ADMIN"]);
  });

  it("rejects an invalid Profile child type before querying", async () => {
    const repository = { getEntityProfilesForAdminGrid: jest.fn() };
    const controller = new PublicProfilesController(
      repository as unknown as ProfileRepository,
    );

    await expect(
      controller.getProfilesForAdminGrid("10", "0", "", "child-one", "Company"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.getEntityProfilesForAdminGrid).not.toHaveBeenCalled();
  });

  it("wraps the stable safe public Profile payload", async () => {
    const data = {
      id: "profile-one",
      slug: "acme",
      canonicalSlug: "acme",
      info: {
        displayName: "Acme",
        summary: "A short summary.",
        description: "A distinct long-form description.",
      },
      children: [],
      reviews: { count: 0, averageRating: null },
      salaries: { count: 0, byCurrency: [] },
      notices: [],
    };
    const repository = {
      getPublicEntityProfile: jest.fn().mockResolvedValue(data),
    };
    const controller = new PublicProfilesController(
      repository as unknown as ProfileRepository,
    );

    await expect(controller.getProfile("acme")).resolves.toEqual({
      success: true,
      message: "Profile retrieved successfully",
      data,
    });
  });

  it("returns the same not-found response for every unknown slug", async () => {
    const repository = {
      getPublicEntityProfile: jest.fn().mockResolvedValue(null),
    };
    const controller = new PublicProfilesController(
      repository as unknown as ProfileRepository,
    );

    for (const slug of ["missing", "another-missing-profile"]) {
      await expect(controller.getProfile(slug)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    }
  });

  it("submits canonical pending reviews with the authenticated actor", async () => {
    const repository = {
      createProfileReview: jest.fn().mockResolvedValue({
        id: "review",
        status: "pending",
      }),
    };
    const controller = new PublicProfilesController(
      repository as unknown as ProfileRepository,
    );
    const input = {
      childId: "organization",
      rating: 5,
      reviewText: "A detailed review",
      salary: 120000,
      currency: "usd",
      offersTokenAllocation: true,
    };

    await expect(
      controller.createReview({ address: "reviewer" } as never, "acme", input),
    ).resolves.toEqual({
      success: true,
      message: "Profile review submitted for moderation",
      data: { id: "review", status: "pending" },
    });
    expect(repository.createProfileReview).toHaveBeenCalledWith(
      "reviewer",
      "acme",
      input,
    );
  });

  it("submits pending cases and rejects unresolved child context", async () => {
    const repository = {
      createRecruiterCase: jest
        .fn()
        .mockResolvedValueOnce({ id: "case", status: "pending" })
        .mockResolvedValueOnce(null),
    };
    const controller = new PublicProfilesController(
      repository as unknown as ProfileRepository,
    );
    const input = {
      childId: "organization",
      allegation: { category: "misrepresentation" },
    };

    await expect(
      controller.createCase({ address: "reporter" } as never, "acme", input),
    ).resolves.toMatchObject({
      success: true,
      data: { status: "pending" },
    });
    await expect(
      controller.createCase({ address: "reporter" } as never, "acme", input),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
