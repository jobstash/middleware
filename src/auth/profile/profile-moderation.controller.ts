import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiOkResponse } from "@nestjs/swagger";
import { PBACGuard } from "src/auth/pbac.guard";
import { ProfileRepository } from "src/postgres/profile.repository";
import { CheckWalletPermissions } from "src/shared/constants";
import { Permissions, Session } from "src/shared/decorators";
import { SessionObject } from "src/shared/interfaces";
import {
  ModerateProfileAppealInput,
  ModerateProfileReviewInput,
  ModerateRecruiterCaseInput,
} from "./dto/create-profile-review.input";

type ProfileModerationResponse = {
  success: true;
  message: string;
  data: Record<string, unknown>;
};

@Controller("profile-moderation")
@UseGuards(PBACGuard)
@Permissions(CheckWalletPermissions.SUPER_ADMIN)
export class ProfileModerationController {
  constructor(private readonly profiles: ProfileRepository) {}

  @Get("queue")
  @ApiOkResponse({
    description:
      "Pending Profile reviews, recruiter reports, public warnings, and appeals",
  })
  async getQueue(
    @Query("limit") rawLimit?: string,
  ): Promise<ProfileModerationResponse> {
    const limit = Math.max(1, Math.min(Number(rawLimit) || 100, 250));
    return {
      success: true as const,
      message: "Profile moderation queue retrieved successfully",
      data: await this.profiles.getProfileModerationQueue(limit),
    };
  }

  @Patch("reviews/:reviewId")
  async moderateReview(
    @Session() session: SessionObject,
    @Param("reviewId") reviewId: string,
    @Body() input: ModerateProfileReviewInput,
  ): Promise<ProfileModerationResponse> {
    const review = await this.profiles.moderateProfileReview(
      reviewId,
      session.address!,
      input,
    );
    if (!review) throw new NotFoundException("Pending review not found");
    return {
      success: true as const,
      message: "Profile review decision saved",
      data: review,
    };
  }

  @Patch("cases/:caseId")
  async moderateCase(
    @Session() session: SessionObject,
    @Param("caseId") caseId: string,
    @Body() input: ModerateRecruiterCaseInput,
  ): Promise<ProfileModerationResponse> {
    const recruiterCase = await this.profiles.moderateRecruiterCase(
      caseId,
      session.address!,
      input,
    );
    if (!recruiterCase) {
      throw new NotFoundException("Active recruiter case not found");
    }
    return {
      success: true as const,
      message:
        input.status === "investigating"
          ? "Recruiter case marked as investigating"
          : "Recruiter case decision saved",
      data: recruiterCase,
    };
  }

  @Patch("appeals/:appealId")
  async moderateAppeal(
    @Session() session: SessionObject,
    @Param("appealId") appealId: string,
    @Body() input: ModerateProfileAppealInput,
  ): Promise<ProfileModerationResponse> {
    const appeal = await this.profiles.moderateProfileAppeal(
      appealId,
      session.address!,
      input,
    );
    if (!appeal) throw new NotFoundException("Pending appeal not found");
    return {
      success: true as const,
      message:
        input.status === "granted"
          ? "Appeal granted and public warning withdrawn"
          : "Appeal reviewed and warning upheld",
      data: appeal,
    };
  }
}
