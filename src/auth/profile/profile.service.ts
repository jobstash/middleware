import { Injectable } from "@nestjs/common";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import {
  OrgReviewEntity,
  UserProfileEntity,
  UserRepoEntity,
} from "src/shared/entities";
import {
  OrgReview,
  PaginatedData,
  Response,
  ResponseWithNoData,
  UserProfile,
  UserRepo,
} from "src/shared/interfaces";
import { UpdateUserProfileInput } from "./dto/update-profile.input";
import { ReviewListParams } from "./dto/review-list.input";
import { intConverter } from "src/shared/helpers";
import * as Sentry from "@sentry/node";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { ReviewOrgSalaryInput } from "./dto/review-org-salary.input";
import { RateOrgInput } from "./dto/rate-org.input";
import { ReviewOrgInput } from "./dto/review-org.input";
import { RepoListParams } from "./dto/repo-list.input";
import { UpdateRepoContributionInput } from "./dto/update-repo-contribution.input";
import { UpdateRepoTagsUsedInput } from "./dto/update-repo-tags-used.input";
import { UpdateUserWorksInput } from "./dto/update-user-works.input";
import { UpdateUserSkillsInput } from "./dto/update-user-skills.input";

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
  ): Promise<PaginatedData<OrgReview> | ResponseWithNoData> {
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
        page: (final.length > 0 ? page ?? 1 : -1) ?? -1,
        count: (limit > final.length ? final.length : limit) ?? 0,
        total: final.length ? intConverter(final.length) : 0,
        data: final.slice(
          page > 1 ? page * limit : 0,
          page === 1 ? limit : (page + 1) * limit,
        ),
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

  async getUserRepos(
    wallet: string,
    params: RepoListParams,
  ): Promise<PaginatedData<UserRepo> | ResponseWithNoData> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (:User {wallet: $wallet})-[:HAS_GITHUB_USER]->(:GithubUser)-[r:HISTORICALLY_CONTRIBUTED_TO]->(repo:GithubRepository)
        RETURN repo {
          id: repo.id,
          name: repo.fullName,
          description: repo.description,
          timestamp: repo.updatedAt.epochMillis,
          projectName: r.projectName,
          committers: apoc.coll.sum([(:GithubUser)-[:HISTORICALLY_CONTRIBUTED_TO]->(repo) | 1]),
          org: [(organization: Organization)-[:HAS_GITHUB|HAS_REPOSITORY*2]->(repo) | organization {
            url: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
            name: organization.name,
            logo: organization.logo
          }][0],
          tags: r.tags,
          contribution: {
            summary: r.summary,
            count: r.commits
          }
        }
        ORDER BY repo.updatedAt DESC
      `,
        { wallet },
      );

      const final = result.records.map(record =>
        new UserRepoEntity(record?.get("repo")).getProperties(),
      );

      const { page, limit } = params;
      return {
        page: (final.length > 0 ? page ?? 1 : -1) ?? -1,
        count: (limit > final.length ? final.length : limit) ?? 0,
        total: final.length ? intConverter(final.length) : 0,
        data: final.slice(
          page > 1 ? page * limit : 0,
          page === 1 ? limit : (page + 1) * limit,
        ),
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
      this.logger.error(`ProfileService::getUserRepos ${err.message}`);
      return {
        success: false,
        message: "Error retrieving user repos",
      };
    }
  }

  async getUserWorks(
    wallet: string,
  ): Promise<Response<{ label: string; url: string }[]> | ResponseWithNoData> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})-[:HAS_WORKS]->(works:UserWorks)
        RETURN works.data as works
      `,
        { wallet },
      );

      return {
        success: true,
        message: "User works retrieved successfully",
        data: result.records[0]?.get("works"),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::getUserWorks ${err.message}`);
      return {
        success: false,
        message: "Error getting user works",
      };
    }
  }

  async getUserSkills(
    wallet: string,
  ): Promise<
    | Response<{ id: string; name: string; canTeach: boolean }[]>
    | ResponseWithNoData
  > {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})-[:HAS_SKILLS]->(skills:UserSkills)
        RETURN skills.data as works
      `,
        { wallet },
      );

      return {
        success: true,
        message: "User skills retrieved successfully",
        data: result.records[0]?.get("works"),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::getUserSkills ${err.message}`);
      return {
        success: false,
        message: "Error getting user skills",
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

  async updateUserWorks(
    wallet: string,
    dto: UpdateUserWorksInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})-[:HAS_WORKS]->(works:UserWorks)
        SET works.data = $works

      `,
        { wallet, ...dto },
      );

      return {
        success: true,
        message: "User works updated successfully",
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
      this.logger.error(`ProfileService::updateUserWorks ${err.message}`);
      return {
        success: false,
        message: "Error updating user works",
      };
    }
  }

  async updateUserSkills(
    wallet: string,
    dto: UpdateUserSkillsInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})-[:HAS_SKILLS]->(skills:UserSkills)
        SET skills.data = $skills

      `,
        { wallet, ...dto },
      );

      return {
        success: true,
        message: "User skills updated successfully",
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
      this.logger.error(`ProfileService::updateUserSkills ${err.message}`);
      return {
        success: false,
        message: "Error updating user skills",
      };
    }
  }

  async reviewOrgSalary(
    wallet: string,
    dto: ReviewOrgSalaryInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MERGE (:User {wallet: $wallet})-[:LEFT_REVIEW]->(review:OrgReview)<-[:HAS_REVIEW]-(:Organization {orgId: $orgId})
        SET review.salary = {
          amount: $salaryAmount,
          selectedCurrency: $selectedCurrency,
          offersTokenAllocation: $offersTokenAllocation
        }
        SET review.reviewedTimestamp = timestamp()
      `,
        { wallet, ...dto },
      );
      return { success: true, message: "Org salary reviewed successfully" };
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
        message: "Error reviewing org salary",
      };
    }
  }

  async rateOrg(
    wallet: string,
    dto: RateOrgInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MERGE (:User {wallet: $wallet})-[:LEFT_REVIEW]->(review:OrgReview)<-[:HAS_REVIEW]-(:Organization {orgId: $orgId})
        SET review.rating = {
          management: $management,
          careerGrowth: $careerGrowth,
          benefits: $benefits,
          workLifeBalance: $workLifeBalance,
          cultureValues: $cultureValues,
          diversityInclusion: $diversityInclusion,
          interviewProcess: $interviewProcess
        }
        SET review.reviewedTimestamp = timestamp()
      `,
        { wallet, ...dto },
      );
      return { success: true, message: "Org salary reviewed successfully" };
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
        message: "Error reviewing org salary",
      };
    }
  }

  async reviewOrg(
    wallet: string,
    dto: ReviewOrgInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MERGE (:User {wallet: $wallet})-[:LEFT_REVIEW]->(review:OrgReview)<-[:HAS_REVIEW]-(:Organization {orgId: $orgId})
        SET review.review = {
          headline: $headline,
          pros: $pros,
          cons: $cons
        }
        SET review.reviewedTimestamp = timestamp()
      `,
        { wallet, ...dto },
      );
      return { success: true, message: "Org salary reviewed successfully" };
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
        message: "Error reviewing org salary",
      };
    }
  }

  async updateRepoContribution(
    wallet: string,
    dto: UpdateRepoContributionInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (:User {wallet: $wallet})-[:HAS_GITHUB_USER]->(:GithubUser)-[r:HISTORICALLY_CONTRIBUTED_TO]->(:GithubRepository {id: $id})
        SET r.summary = $contribution
      `,
        { wallet, ...dto },
      );

      return {
        success: true,
        message: "User repo contribution updated successfully",
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
      this.logger.error(
        `ProfileService::updateRepoContribution ${err.message}`,
      );
      return {
        success: false,
        message: "Error updating user repo contribution",
      };
    }
  }

  async updateRepoTagsUsed(
    wallet: string,
    dto: UpdateRepoTagsUsedInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (:User {wallet: $wallet})-[:HAS_GITHUB_USER]->(:GithubUser)-[r:HISTORICALLY_CONTRIBUTED_TO]->(:GithubRepository {id: $id})
        SET r.tags = $tagsUsed
      `,
        { wallet, ...dto },
      );

      return {
        success: true,
        message: "User repo tags used updated successfully",
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
      this.logger.error(
        `ProfileService::updateRepoContribution ${err.message}`,
      );
      return {
        success: false,
        message: "Error updating user repo tags used",
      };
    }
  }
}
