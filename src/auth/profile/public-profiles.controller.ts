import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiCreatedResponse, ApiOkResponse } from "@nestjs/swagger";
import { PBACGuard } from "src/auth/pbac.guard";
import { ProfileRepository } from "src/postgres/profile.repository";
import { CheckWalletPermissions } from "src/shared/constants";
import { Permissions, Session } from "src/shared/decorators";
import { SessionObject } from "src/shared/interfaces";
import {
  CreateProfileReviewInput,
  CreateProfileAppealInput,
  CreateRecruiterCaseInput,
} from "./dto/create-profile-review.input";

type PublicProfileMutationResponse = {
  success: true;
  message: string;
  data: Record<string, unknown>;
};

@Controller("profiles")
export class PublicProfilesController {
  constructor(private readonly profiles: ProfileRepository) {}

  @Post("notices/:noticeId/appeals")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiCreatedResponse({
    description: "Creates an appeal against a decided public Profile notice",
  })
  async createAppeal(
    @Session() session: SessionObject,
    @Param("noticeId") noticeId: string,
    @Body() input: CreateProfileAppealInput,
  ): Promise<PublicProfileMutationResponse> {
    const appeal = await this.profiles.createProfileAppeal(
      session.address!,
      noticeId,
      input.appealText,
    );
    if (!appeal) {
      throw new BadRequestException(
        "Decided notice not found or an appeal is already pending",
      );
    }
    return {
      success: true as const,
      message: "Profile notice appeal submitted for review",
      data: appeal,
    };
  }

  @Get("grid")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  @ApiOkResponse({
    description:
      "A paginated admin Profile list with linked ProfileInfo, Organizations, and Projects",
  })
  async getProfilesForAdminGrid(
    @Query("limit") rawLimit?: string,
    @Query("offset") rawOffset?: string,
    @Query("query") rawQuery?: string,
    @Query("childId") rawChildId?: string,
    @Query("childType") rawChildType?: string,
  ): Promise<{
    success: true;
    message: string;
    data: Record<string, unknown>[];
    total: number;
  }> {
    const limit = Math.max(1, Math.min(Number(rawLimit) || 100, 500));
    const offset = Math.max(0, Number(rawOffset) || 0);
    const query = rawQuery?.trim().slice(0, 200) || undefined;
    const childId = rawChildId?.trim() || undefined;
    if (
      rawChildType &&
      rawChildType !== "Organization" &&
      rawChildType !== "Project"
    ) {
      throw new BadRequestException(
        "childType must be Organization or Project",
      );
    }
    const childType =
      rawChildType === "Organization" || rawChildType === "Project"
        ? rawChildType
        : undefined;
    const result = await this.profiles.getEntityProfilesForAdminGrid({
      limit,
      offset,
      query,
      childId,
      childType,
    });
    return {
      success: true,
      message: "Retrieved the Profile grid successfully",
      data: result.data,
      total: result.total,
    };
  }

  @Get(":slug")
  @ApiOkResponse({
    description:
      "A public Profile with allow-listed ProfileInfo, child summaries, aggregate reviews/salaries, and decided redacted notices",
  })
  async getProfile(@Param("slug") slug: string): Promise<{
    success: true;
    message: string;
    data: Record<string, unknown>;
  }> {
    const profile = await this.profiles.getPublicEntityProfile(slug);
    if (!profile) {
      throw new NotFoundException({
        message: "Profile not found",
        action: { label: "Browse companies", href: "/organizations" },
      });
    }
    return {
      success: true,
      message: "Profile retrieved successfully",
      data: profile,
    };
  }

  @Post(":slug/reviews")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiCreatedResponse({
    description:
      "Creates a pending Profile-owned review with exact optional child context",
  })
  async createReview(
    @Session() session: SessionObject,
    @Param("slug") slug: string,
    @Body() input: CreateProfileReviewInput,
  ): Promise<PublicProfileMutationResponse> {
    const review = await this.profiles.createProfileReview(
      session.address!,
      slug,
      input,
    );
    if (!review) {
      throw new BadRequestException(
        "Profile, organization, or verified employment evidence was not found",
      );
    }
    return {
      success: true as const,
      message: "Profile review submitted for moderation",
      data: review,
    };
  }

  @Post(":slug/cases")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.USER)
  @ApiCreatedResponse({
    description:
      "Creates a pending recruiter case; pending cases have no live effects",
  })
  async createCase(
    @Session() session: SessionObject,
    @Param("slug") slug: string,
    @Body() input: CreateRecruiterCaseInput,
  ): Promise<PublicProfileMutationResponse> {
    const recruiterCase = await this.profiles.createRecruiterCase(
      session.address!,
      slug,
      input,
    );
    if (!recruiterCase) {
      throw new BadRequestException(
        "Profile or exact child context was not found",
      );
    }
    return {
      success: true as const,
      message: "Recruiter case submitted for review",
      data: recruiterCase,
    };
  }
}
