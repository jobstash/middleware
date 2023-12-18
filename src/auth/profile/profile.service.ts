import { Injectable } from "@nestjs/common";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import {
  UserOrgEntity,
  UserProfileEntity,
  UserRepoEntity,
  UserShowCaseEntity,
  UserSkillEntity,
} from "src/shared/entities";
import {
  UserOrg,
  PaginatedData,
  Response,
  ResponseWithNoData,
  UserProfile,
  UserRepo,
} from "src/shared/interfaces";
import { UpdateUserProfileInput } from "./dto/update-profile.input";
import { ReviewListParams } from "./dto/review-list.input";
import { normalizeString, paginate } from "src/shared/helpers";
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
import { ModelService } from "src/model/model.service";
import { randomUUID } from "crypto";

@Injectable()
export class ProfileService {
  private readonly logger = new CustomLogger(ProfileService.name);

  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private models: ModelService,
  ) {}

  async getUserProfile(
    wallet: string,
  ): Promise<Response<UserProfile> | ResponseWithNoData> {
    try {
      const userProfile = await this.models.Users.findRelationships({
        where: { source: { wallet } },
        alias: "profile",
      });

      const userEmail = await this.models.Users.findRelationships({
        where: { source: { wallet } },
        alias: "email",
      });

      const userContact = await this.models.Users.findRelationships({
        where: { source: { wallet } },
        alias: "contact",
      });

      const userGithub = await this.models.Users.findRelationships({
        where: { source: { wallet } },
        alias: "githubUser",
      });

      return {
        success: true,
        message: "User Profile retrieved successfully",
        data: new UserProfileEntity({
          availableForWork: userProfile[0]?.target.availableForWork,
          avatar: userGithub[0]?.target.avatarUrl,
          username: userGithub[0]?.target.login,
          contact: {
            value: userContact[0]?.target.value,
            preferred: userContact[0]?.target.preferred,
          },
          email: userEmail[0]?.target.email,
        }).getProperties(),
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
  ): Promise<PaginatedData<UserOrg> | ResponseWithNoData> {
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
        new UserOrgEntity(record?.get("review")).getProperties(),
      );

      const { page, limit } = params;
      return paginate<UserOrg>(page, limit, final);
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
          tags: apoc.coll.toSet([(user)-[m:USED_TAG]->(tag: Tag)-[:USED_ON]->(repo) | tag {
            .*,
            canTeach: [(user)-[m:USED_TAG]->(tag)-[:USED_ON]->(repo) | m.canTeach][0]
          }]),
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
  ): Promise<Response<UserOrg[]> | ResponseWithNoData> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: "0x921f80499A00aC6E95AAE0DAa411D338f41D5Da2"})
        OPTIONAL MATCH (user)-[:HAS_GITHUB_USER|HISTORICALLY_CONTRIBUTED_TO*2]->(:GithubRepository)<-[:HAS_REPOSITORY|HAS_GITHUB*2]-(organization: Organization)
        OPTIONAL MATCH (user)-[:LEFT_REVIEW]->(review:OrgReview)<-[:HAS_REVIEW]-(organization)
        WITH apoc.coll.toSet(COLLECT(organization {
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
            updatedTimestamp: organization.updatedTimestamp,
            docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
            github: [(organization)-[:HAS_GITHUB]->(github) | github.login][0],
            website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
            discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
            telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
            twitter: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(twitter) | twitter.username][0]
          }
        })) as orgsByRepo, user

        CALL {
          WITH user
          MATCH (organization: Organization)-[:HAS_WEBSITE]->(website: Website)
          MATCH (user)-[:HAS_EMAIL]->(email: UserEmail)
          WHERE email IS NOT NULL AND website IS NOT NULL AND apoc.data.url(website.url).host CONTAINS apoc.data.email(email.email).domain
          OPTIONAL MATCH (user)-[:LEFT_REVIEW]->(review:OrgReview)<-[:HAS_REVIEW]-(organization)
          RETURN apoc.coll.toSet(COLLECT(organization {
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
              updatedTimestamp: organization.updatedTimestamp,
              docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
              github: [(organization)-[:HAS_GITHUB]->(github) | github.login][0],
              website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
              discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
              telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
              twitter: [(organization)-[:HAS_ORGANIZATION_ALIAS]->(twitter) | twitter.username][0]
            }
          })) as orgsByEmail
        }
        RETURN apoc.coll.union(orgsByRepo, orgsByEmail) as organizations        
      `,
        { wallet },
      );

      const final = result.records[0]
        .get("organizations")
        .map(record => new UserOrgEntity(record).getProperties());

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
      const showcases = await this.models.Users.findRelationships({
        alias: "showcases",
        where: { source: { wallet: wallet } },
      });

      return {
        success: true,
        message: "User showcase retrieved successfully",
        data: showcases.map(x =>
          new UserShowCaseEntity(x.target.getDataValues()).getProperties(),
        ),
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
        MATCH (user:User {wallet: $wallet})-[r:HAS_SKILL]->(skill:Tag)
        RETURN skill { id: skill.id, name: skill.name, canTeach: r.canTeach }
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
        MATCH (user:User {wallet: $wallet})
        MERGE (user)-[:HAS_PROFILE]->(profile:UserProfile)
        SET profile.availableForWork = $availableForWork

        WITH user
        MERGE (user)-[:HAS_CONTACT_INFO]->(contact: UserContactInfo)
        SET contact.preferred = $preferred
        SET contact.value = $value
        
        WITH user
        RETURN {
          availableForWork: [(user)-[:HAS_PROFILE]->(profile:UserProfile) | profile.availableForWork][0],
          email: [(user)-[:HAS_EMAIL]->(email:UserEmail) | email.email][0],
          username: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.login][0],
          avatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
          contact: [(user)-[:HAS_CONTACT_INFO]->(contact: UserContactInfo) | contact { .* }][0]
        } as profile

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
        OPTIONAL MATCH (user)-[er:HAS_EMAIL]->(email:UserEmail|UserUnverifiedEmail)
        DETACH DELETE user, pr, profile, cr, contact, rr, gr, scr, showcase, sr, skills, er, email
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
      const oldShowcases = await this.models.Users.findRelationships({
        alias: "showcases",
        where: { source: { wallet: wallet } },
      });
      const newShowcases = dto.showcase.map(x => ({ ...x, id: randomUUID() }));
      for (const showcase of oldShowcases) {
        await showcase.target.delete({ detach: true });
      }
      if (newShowcases.length !== 0) {
        await this.models.UserShowcases.createMany(newShowcases, {
          merge: true,
        });
        for (const showcase of newShowcases) {
          await this.models.Users.relateTo({
            alias: "showcases",
            where: {
              source: {
                wallet: wallet,
              },
              target: {
                id: showcase.id,
              },
            },
          });
        }
      }
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
      const oldSkills = await this.models.Users.findRelationships({
        alias: "skills",
        where: { source: { wallet: wallet } },
      });
      const newSkills = dto.skills;
      for (const skill of oldSkills) {
        await this.models.Users.deleteRelationships({
          alias: "skills",
          where: {
            source: {
              wallet: wallet,
            },
            target: {
              id: skill.target.id,
            },
            relationship: {
              canTeach: skill.relationship["canTeach"],
            },
          },
        });
      }
      if (newSkills.length !== 0) {
        for (const skill of newSkills) {
          await this.models.Users.relateTo({
            alias: "skills",
            where: {
              source: {
                wallet: wallet,
              },
              target: {
                normalizedName: normalizeString(skill.name),
              },
            },
            properties: {
              canTeach: skill.canTeach,
            },
            assertCreatedRelationships: 1,
          });
        }
      }

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
        SET review.amount = $amount
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
        DETACH DELETE r1,r2

        WITH ghu
        UNWIND $tagsUsed as data
        WITH data, ghu
        MATCH (repo:GithubRepository {id: $id}), (tag: Tag {normalizedName: data.normalizedName})
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

  async verifyApplyInteraction(
    wallet: string,
    shortUUID: string,
  ): Promise<boolean> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet}), (job:StructuredJobpost {shortUUID: $shortUUID})
        RETURN EXISTS((user)-[:APPLIED_TO]->(job)) AS hasApplied
      `,
        { wallet, shortUUID },
      );
      return result.records[0]?.get("hasApplied") as boolean;
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
        `ProfileService::verifyApplyInteraction ${err.message}`,
      );
      return false;
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

  async verifyBookmarkInteraction(
    wallet: string,
    shortUUID: string,
  ): Promise<boolean> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet}), (job:StructuredJobpost {shortUUID: $shortUUID})
        RETURN EXISTS((user)-[:BOOKMARKED]->(job)) as isBookmarked
      `,
        { wallet, shortUUID },
      );
      return result.records[0]?.get("isBookmarked") as boolean;
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
        `ProfileService::verifyBookmarkInteraction ${err.message}`,
      );
      return false;
    }
  }

  async removeBookmarkInteraction(
    wallet: string,
    shortUUID: string,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet}), (job:StructuredJobpost {shortUUID: $shortUUID})
        MATCH (user)-[r:BOOKMARKED]->(job)
        DELETE r
      `,
        { wallet, shortUUID },
      );
      return {
        success: true,
        message: "Unbookmarked job successfully",
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
        `ProfileService::removeBookmarkInteraction ${err.message}`,
      );
      return {
        success: false,
        message: "Failed to unbookmark job",
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
