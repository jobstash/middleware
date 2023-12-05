import { Injectable } from "@nestjs/common";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import {
  OrgReviewEntity,
  UserProfileEntity,
  UserRepoEntity,
  UserShowCaseEntity,
  UserSkillEntity,
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
import { paginate } from "src/shared/helpers";
import * as Sentry from "@sentry/node";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { ReviewOrgSalaryInput } from "./dto/review-org-salary.input";
import { RateOrgInput } from "./dto/rate-org.input";
import { ReviewOrgInput } from "./dto/review-org.input";
import { RepoListParams } from "./dto/repo-list.input";
import { UpdateRepoContributionInput } from "./dto/update-repo-contribution.input";
import { UpdateRepoTagsUsedInput } from "./dto/update-repo-tags-used.input";
import { UpdateUserShowCaseInput } from "./dto/update-user-showcase.input";
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
          role: [(user)-[:HAS_ROLE]->(ur:UserRole) | ur.name][0],
          flow: [(user)-[:HAS_USER_FLOW_STAGE]->(uf:UserFlow) | uf.name][0],
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
        MATCH (user:User {wallet: $wallet})-[r:LEFT_REVIEW]->(review:OrgReview)
        RETURN review {
          salary: {
            amount: review.amount,
            selectedCurrency: review.selectedCurrency,
            offersTokenAllocation: review.offersTokenAllocation
          },
          rating: {
            management: review.management,
            careerGrowth: review.careerGrowth,
            benefits: review.benefits,
            workLifeBalance: review.workLifeBalance,
            cultureValues: review.cultureValues,
            diversityInclusion: review.diversityInclusion,
            interviewProcess: review.interviewProcess
          },
          review: {
            headline: review.headline,
            pros: review.pros,
            cons: review.cons
          },
          reviewedTimestamp: review.reviewedTimestamp,
          org: [(organization: Organization)-[:HAS_REVIEW]->(review) | organization {
            id: organization.id,
            name: organization.name,
            logo: organization.logo,
            orgId: organization.orgId,
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
      return paginate<OrgReview>(page, limit, final);
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
        MATCH (:User {wallet: $wallet})-[:HAS_GITHUB_USER]->(user:GithubUser)-[r:HISTORICALLY_CONTRIBUTED_TO]->(repo:GithubRepository)
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
          tags: [(user)-[m:USED_TAG]->(tag: Tag)-[:USED_ON]->(repo) | tag {
            .*,
            canTeach: [(user)-[m:USED_TAG]->(tag)-[:USED_ON]->(repo) | m.canTeach][0]
          }],
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
      return paginate<UserRepo>(page, limit, final);
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

  async getUserOrgs(
    wallet: string,
  ): Promise<Response<OrgReview[]> | ResponseWithNoData> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})-[:HAS_GITHUB_USER|HISTORICALLY_CONTRIBUTED_TO*2]->(repo:GithubRepository)<-[:HAS_REPOSITORY|HAS_GITHUB*2]-(organization: Organization)
        OPTIONAL MATCH (user)-[:LEFT_REVIEW]->(review:OrgReview)<-[:HAS_REVIEW]-(organization)
        RETURN organization {
          salary: {
            amount: review.amount,
            selectedCurrency: review.selectedCurrency,
            offersTokenAllocation: review.offersTokenAllocation
          },
          rating: {
            management: review.management,
            careerGrowth: review.careerGrowth,
            benefits: review.benefits,
            workLifeBalance: review.workLifeBalance,
            cultureValues: review.cultureValues,
            diversityInclusion: review.diversityInclusion,
            interviewProcess: review.interviewProcess
          },
          review: {
            headline: review.headline,
            pros: review.pros,
            cons: review.cons
          },
          reviewedTimestamp: review.reviewedTimestamp,
          org: {
            id: organization.id,
            name: organization.name,
            logo: organization.logo,
            orgId: organization.orgId,
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
          }
        }
        ORDER BY review.reviewedTimestamp DESC
      `,
        { wallet },
      );

      const final = result.records.map(record =>
        new OrgReviewEntity(record?.get("organization")).getProperties(),
      );

      return {
        success: true,
        message: "Retrieved user orgs",
        data: final,
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
      this.logger.error(`ProfileService::getUserOrgs ${err.message}`);
      return {
        success: false,
        message: "Error retrieving user orgs",
      };
    }
  }

  async getUserShowCase(
    wallet: string,
  ): Promise<Response<{ label: string; url: string }[]> | ResponseWithNoData> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})-[:HAS_SHOWCASE]->(showcase:UserShowCase)
        RETURN showcase { .* }
      `,
        { wallet },
      );

      return {
        success: true,
        message: "User showcase retrieved successfully",
        data:
          result.records.map(record =>
            new UserShowCaseEntity(record.get("showcase")).getProperties(),
          ) ?? [],
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
      this.logger.error(`ProfileService::getUserShowCase ${err.message}`);
      return {
        success: false,
        message: "Error getting user showcase",
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
        MATCH (user:User {wallet: $wallet})-[:HAS_SKILL]->(skill:UserSkill)
        RETURN skill { .* }
      `,
        { wallet },
      );

      return {
        success: true,
        message: "User skills retrieved successfully",
        data:
          result.records?.map(record =>
            new UserSkillEntity(record.get("skill")).getProperties(),
          ) ?? [],
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
        MERGE (user:User {wallet: $wallet})-[:HAS_PROFILE]->(profile:UserProfile)
        SET profile.availableForWork = $availableForWork

        WITH user
        MERGE (user)-[:HAS_CONTACT_INFO]->(contact: UserContactInfo)
        SET contact.preferred = $preferred
        SET contact.value = $value
        
        RETURN profile {
          .*,
          username: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.login][0],
          avatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
          role: [(user)-[:HAS_ROLE]->(ur:UserRole) | ur.name][0],
          flow: [(user)-[:HAS_USER_FLOW_STAGE]->(uf:UserFlow) | uf.name][0],
          contact: [(user)-[:HAS_CONTACT_INFO]->(contact: UserContactInfo) | contact { .* }][0]
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

  async deleteUserAccount(wallet: string): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})
        OPTIONAL MATCH (user)-[pr:HAS_PROFILE]->(profile:UserProfile)
        OPTIONAL MATCH (user)-[cr:HAS_CONTACT_INFO]->(contact: UserContactInfo)
        OPTIONAL MATCH (user)-[rr:LEFT_REVIEW]->(:OrgReview)
        OPTIONAL MATCH (user)-[gr:HAS_GITHUB_USER]->(:GithubUser)
        OPTIONAL MATCH (user)-[scr:HAS_SHOWCASE]->(showcase:UserShowCase)
        OPTIONAL MATCH (user)-[sr:HAS_SKILLS]->(skills:UserSkills)
        DETACH DELETE user, pr, profile, cr, contact, rr, gr, scr, showcase, sr, skills
      `,
        { wallet },
      );

      return {
        success: true,
        message: "User account deleted successfully",
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
      this.logger.error(`ProfileService::deleteUserAccount ${err.message}`);
      return {
        success: false,
        message: "Error deleting user account",
      };
    }
  }

  async updateUserShowCase(
    wallet: string,
    dto: UpdateUserShowCaseInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})
        OPTIONAL MATCH (user)-[r:HAS_SHOWCASE]->(os:UserShowCase)
        DETACH DELETE r, os

        WITH user
        UNWIND $showcase as data
        WITH data, user
        CREATE (user)-[:HAS_SHOWCASE]->(showcase:UserShowCase)
        SET showcase.label = data.label
        SET showcase.url = data.url
      `,
        { wallet, ...dto },
      );

      return {
        success: true,
        message: "User showcase updated successfully",
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
      this.logger.error(`ProfileService::updateUserShowCase ${err.message}`);
      return {
        success: false,
        message: "Error updating user showcase",
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
        MATCH (user:User {wallet: $wallet})
        OPTIONAL MATCH (user)-[r:HAS_SKILL]->(os:UserSkill)
        DETACH DELETE r, os

        WITH user
        UNWIND $skills as data
        WITH data, user
        CREATE (user)-[:HAS_SKILL]->(skill:UserSkill)
        SET skill.id = data.id
        SET skill.name = data.name
        SET skill.canTeach = data.canTeach
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
        MATCH (user:User {wallet: $wallet}), (org:Organization {orgId: $orgId})
        MERGE (user)-[:LEFT_REVIEW]->(review:OrgReview)<-[:HAS_REVIEW]-(org)
        SET review.amount = $salaryAmount
        SET review.selectedCurrency = $selectedCurrency
        SET review.offersTokenAllocation = $offersTokenAllocation
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
        MATCH (user:User {wallet: $wallet}), (org:Organization {orgId: $orgId})
        MERGE (user)-[:LEFT_REVIEW]->(review:OrgReview)<-[:HAS_REVIEW]-(org)
        SET review.management = $management
        SET review.careerGrowth = $careerGrowth
        SET review.benefits = $benefits
        SET review.workLifeBalance = $workLifeBalance
        SET review.cultureValues = $cultureValues
        SET review.diversityInclusion = $diversityInclusion
        SET review.interviewProcess = $interviewProcess
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
        MATCH (user:User {wallet: $wallet}), (org:Organization {orgId: $orgId})
        MERGE (user)-[:LEFT_REVIEW]->(review:OrgReview)<-[:HAS_REVIEW]-(org)
        SET review.headline = $headline
        SET review.pros = $pros
        SET review.cons = $cons
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
        MATCH (user:User {wallet: $wallet})
        MATCH (user)-[:HAS_GITHUB_USER]->(ghu:GithubUser)-[:HISTORICALLY_CONTRIBUTED_TO]->(repo:GithubRepository {id: $id})
        OPTIONAL MATCH (ghu)-[r1:USED_TAG]->(tag: Tag)-[r2:USED_ON]->(repo)
        DETACH DELETE r1,tag,r2

        WITH ghu
        UNWIND $tagsUsed as data
        WITH data, ghu
        MATCH (repo:GithubRepository {id: $id}), (tag: Tag {id: data.id})
        CREATE (ghu)-[r:USED_TAG]->(tag)-[:USED_ON]->(repo)
        SET r.canTeach = data.canTeach
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

  async blockOrgJobs(
    wallet: string,
    orgId: string,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet}), (org:Organization {orgId: $orgId})
        CREATE (user)-[r:BLOCKED_ORG_JOBS]->(org)
        SET r.timestamp = timestamp()
      `,
        { wallet, orgId },
      );
      return { success: true, message: "Org jobs blocked successfully" };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, orgId });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::blockOrgJobs ${err.message}`);
      return {
        success: false,
        message: "Error blocking org jobs",
      };
    }
  }

  async logApplyInteraction(
    wallet: string,
    shortUUID: string,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet}), (job:StructuredJobpost {shortUUID: $shortUUID})
        CREATE (user)-[r:APPLIED_TO]->(job)
        SET r.timestamp = timestamp()
      `,
        { wallet, shortUUID },
      );
      return {
        success: true,
        message: "Logged application to job successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, shortUUID });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::logApplyInteraction ${err.message}`);
      return {
        success: false,
        message: "Failed to log application to job",
      };
    }
  }

  async logBookmarkInteraction(
    wallet: string,
    shortUUID: string,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet}), (job:StructuredJobpost {shortUUID: $shortUUID})
        CREATE (user)-[r:BOOKMARKED]->(job)
        SET r.timestamp = timestamp()
      `,
        { wallet, shortUUID },
      );
      return {
        success: true,
        message: "Bookmarked job successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, shortUUID });
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProfileService::logBookmarkInteraction ${err.message}`,
      );
      return {
        success: false,
        message: "Failed to bookmark job",
      };
    }
  }

  async logViewDetailsInteraction(
    wallet: string,
    shortUUID: string,
  ): Promise<void> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet}), (job:StructuredJobpost {shortUUID: $shortUUID})
        CREATE (user)-[r:VIEWED_DETAILS]->(job)
        SET r.timestamp = timestamp()
      `,
        { wallet, shortUUID },
      );
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, shortUUID });
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProfileService::logViewDetailsInteraction ${err.message}`,
      );
    }
  }

  async logSearchInteraction(wallet: string, query: string): Promise<void> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})
        CREATE (user)-[r:DID_SEARCH]->(:SearchHistory {query: $query})
        SET r.timestamp = timestamp()
      `,
        { wallet, query },
      );
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, query });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::logSearchInteraction ${err.message}`);
    }
  }
}
