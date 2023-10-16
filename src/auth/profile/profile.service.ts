import { Injectable } from "@nestjs/common";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import { OrgReviewEntity, UserProfileEntity } from "src/shared/entities";
import {
  OrgReview,
  PaginatedData,
  Response,
  ResponseWithNoData,
  UserProfile,
} from "src/shared/interfaces";
import { UpdateUserProfileInput } from "./dto/update-profile.input";
import { ReviewListParams } from "./dto/review-list.input";
import { intConverter } from "src/shared/helpers";
import * as Sentry from "@sentry/node";
import { CustomLogger } from "src/shared/utils/custom-logger";

@Injectable()
export class ProfileService {
  private readonly logger = new CustomLogger(ProfileService.name);

  constructor(
    @InjectConnection()
    private neogma: Neogma,
  ) {}

  async getUserProfile(
    wallet: string,
  ): Promise<Response<UserProfile> | ResponseWithNoData> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        RETURN [(user:User {wallet: $wallet})-[:HAS_PROFILE]->(profile:UserProfile) | profile {
          .*,
          username: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.login][0],
          avatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
          contact: [(user)-[:HAS_CONTACT_INFO]->(contact: UserContactInfo) | contact { .* }][0]
        }][0] as profile

      `,
        { wallet },
      );

      return {
        success: true,
        message: "User Profile retrieved successfully",
        data: new UserProfileEntity(
          result.records[0]?.get("profile"),
        ).getProperties(),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", wallet);
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::getUserProfile ${err.message}`);
      return {
        success: false,
        message: "Error retrieving user profile",
      };
    }
  }

  async getOrgReviews(
    wallet: string,
    params: ReviewListParams,
  ): Promise<Response<PaginatedData<OrgReview>> | ResponseWithNoData> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})-[:LEFT_REVIEW]->(review:OrgReview)
        RETURN review {
          .*,
          org: [(organization: Organization)-[:HAS_REVIEW]->(review) | organization {
            id: organization.id,
            url: organization.url,
            name: organization.name,
            logo: organization.logo,
            summary: organization.summary,
            altName: organization.altName,
            location: organization.location,
            headCount: organization.headCount,
            description: organization.description,
            jobsiteLink: organization.jobsiteLink,
            organizationId: organization.organizationId,
            updatedTimestamp: organization.updatedTimestamp,
            docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
            github: [(organization)-[:HAS_GITHUB]->(github) | github.login][0],
            website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
            discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
            telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
            twitter: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(twitter) | twitter.username][0]
          }][0]
        }
        ORDER BY review.reviewedTimestamp DESC
      `,
        { wallet },
      );

      const final = result.records.map(record =>
        new OrgReviewEntity(record?.get("review")).getProperties(),
      );

      const { page, limit } = params;

      return {
        success: true,
        message: "User Org Reviews retrieved successfully",
        data: {
          page: (final.length > 0 ? page ?? 1 : -1) ?? -1,
          count: (limit > final.length ? final.length : limit) ?? 0,
          total: final.length ? intConverter(final.length) : 0,
          data: final.slice(
            page > 1 ? page * limit : 0,
            page === 1 ? limit : (page + 1) * limit,
          ),
        },
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, ...params });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::getOrgReviews ${err.message}`);
      return {
        success: false,
        message: "Error retrieving user org reviews",
      };
    }
  }

  async updateUserProfile(
    wallet: string,
    dto: UpdateUserProfileInput,
  ): Promise<Response<UserProfile> | ResponseWithNoData> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})-[:HAS_PROFILE]->(profile:UserProfile)
        MATCH (user)-[:HAS_CONTACT_INFO]->(contact: UserContactInfo)
        SET profile.availableForWork = $availableForWork
        SET contact.preferred = $preferred
        SET contact.value = $value
        
        RETURN profile {
          .*,
          username: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.login][0],
          avatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
          contact: contact
        }

      `,
        { wallet, ...dto, ...dto.contact },
      );

      return {
        success: true,
        message: "User profile updated successfully",
        data: new UserProfileEntity(
          result.records[0]?.get("profile"),
        ).getProperties(),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::updateUserProfile ${err.message}`);
      return {
        success: false,
        message: "Error updating user profile",
      };
    }
  }
}
