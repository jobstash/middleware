import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
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
  CreateRecruiterCaseInput,
} from "./dto/create-profile-review.input";

@Controller("profiles")
export class PublicProfilesController {
  constructor(private readonly profiles: ProfileRepository) {}

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
  ) {
    const review = await this.profiles.createProfileReview(
      session.address!,
      slug,
      input,
    );
    if (!review) {
      throw new BadRequestException(
        "Profile or exact child context was not found",
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
  ) {
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
