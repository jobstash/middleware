import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import { randomUUID } from "crypto";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import { ModelService } from "src/model/model.service";
import {
  OrgUserProfileEntity,
  UserOrgEntity,
  UserProfileEntity,
  UserRepoEntity,
  UserShowCaseEntity,
  UserSkillEntity,
} from "src/shared/entities";
import {
  normalizeString,
  paginate,
  intConverter,
  nonZeroOrNull,
} from "src/shared/helpers";
import {
  OrgStaffReview,
  OrgUserProfile,
  PaginatedData,
  Response,
  ResponseWithNoData,
  ResponseWithOptionalData,
  UserOrg,
  UserProfile,
  UserRepo,
  UserShowCase,
  UserSkill,
  UserWorkHistory,
  data,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { RateOrgInput } from "./dto/rate-org.input";
import { RepoListParams } from "./dto/repo-list.input";
import { ReviewOrgSalaryInput } from "./dto/review-org-salary.input";
import { ReviewOrgInput } from "./dto/review-org.input";
import { UpdateRepoContributionInput } from "./dto/update-repo-contribution.input";
import { UpdateRepoTagsUsedInput } from "./dto/update-repo-tags-used.input";
import { UpdateUserShowCaseInput } from "./dto/update-user-showcase.input";
import { UpdateUserSkillsInput } from "./dto/update-user-skills.input";
import { Integer } from "neo4j-driver";
import { OrgStaffReviewEntity } from "src/shared/entities/org-staff-review.entity";
import { UpdateOrgUserProfileInput } from "./dto/update-org-profile.input";
import { UpdateDevUserProfileInput } from "./dto/update-dev-profile.input";
import { UserService } from "src/user/user.service";

@Injectable()
export class ProfileService {
  private readonly logger = new CustomLogger(ProfileService.name);

  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private models: ModelService,
    private readonly userService: UserService,
  ) {}

  async getDevUserProfile(
    wallet: string,
  ): Promise<ResponseWithOptionalData<UserProfile>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})
        RETURN {
          wallet: $wallet,
          availableForWork: user.available,
          email: [(user)-[:HAS_EMAIL]->(email:UserEmail) | email.email][0],
          username: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.login][0],
          avatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
          contact: [(user)-[:HAS_CONTACT_INFO]->(contact: UserContactInfo) | contact { .* }][0],
          location: [(user)-[:HAS_LOCATION]->(location: UserLocation) | location { .* }][0]
        } as profile
        `,
        { wallet },
      );

      return {
        success: true,
        message: "User Profile retrieved successfully",
        data: result.records[0]?.get("profile")
          ? new UserProfileEntity(
              result.records[0]?.get("profile"),
            ).getProperties()
          : undefined,
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
      this.logger.error(`ProfileService::getDevUserProfile ${err.message}`);
      return {
        success: false,
        message: "Error retrieving dev user profile",
      };
    }
  }

  async getOrgUserProfile(
    wallet: string,
  ): Promise<ResponseWithOptionalData<OrgUserProfile>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})
        RETURN user {
          .*,
          email: [(user)-[:HAS_EMAIL]->(email:UserEmail) | email.email][0],
          username: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.login][0],
          avatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
          contact: [(user)-[:HAS_CONTACT_INFO]->(contact: UserContactInfo) | contact { .* }][0],
          orgId: [(user)-[:HAS_ORGANIZATION_AUTHORIZATION]->(organization:Organization) | organization.orgId][0],
          internalReference: [(user)-[:HAS_INTERNAL_REFERENCE]->(reference: OrgUserReferenceInfo) | reference { .* }][0],
          subscriberStatus: [(user)-[:HAS_ORGANIZATION_AUTHORIZATION|HAS_SUBSCRIPTION*2]->(subscription:Subscription) | subscription { .* }][0]
        } as profile
        `,
        { wallet },
      );

      return {
        success: true,
        message: "User Profile retrieved successfully",
        data: result.records[0]?.get("profile")
          ? new OrgUserProfileEntity(
              result.records[0]?.get("profile"),
            ).getProperties()
          : undefined,
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
      this.logger.error(`ProfileService::getOrgUserProfile ${err.message}`);
      return {
        success: false,
        message: "Error retrieving org user profile",
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
        MATCH (user:User {wallet: $wallet})-[:HAS_GITHUB_USER]->(gu:GithubUser)-[r:CONTRIBUTED_TO]->(repo:GithubRepository)
        RETURN repo {
          id: repo.id,
          name: repo.nameWithOwner,
          description: repo.description,
          timestamp: repo.updatedAt.epochMillis,
          projectName: r.projectName,
          committers: apoc.coll.sum([(:GithubUser)-[:CONTRIBUTED_TO]->(repo) | 1]),
          org: [(organization: Organization)-[:HAS_GITHUB|HAS_REPOSITORY*2]->(repo) | organization {
            url: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
            name: organization.name,
            logo: organization.logo
          }][0],
          tags: apoc.coll.toSet([(gu)-[:USED_TAG]->(tag: Tag)-[:USED_ON]->(repo) WHERE (user)-[:HAS_SKILL]->(tag) | tag {
            .*,
            canTeach: [(user)-[m:HAS_SKILL]->(tag)-[:USED_ON]->(repo) | m.canTeach][0]
          }]),
          contribution: {
            summary: r.summary,
            count: r.committedCount
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
  ): Promise<ResponseWithOptionalData<UserOrg[]>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})
        OPTIONAL MATCH (user)-[:HAS_GITHUB_USER|CONTRIBUTED_TO*2]->(:GithubRepository)<-[:HAS_REPOSITORY|HAS_GITHUB*2]-(organization: Organization)
        OPTIONAL MATCH (user)-[:LEFT_REVIEW]->(review:OrgReview)<-[:HAS_REVIEW]-(organization)
        WITH apoc.coll.toSet(COLLECT(organization {
          compensation: {
            salary: review.salary,
            currency: review.currency,
            offersTokenAllocation: review.offersTokenAllocation
          },
          rating: {
            onboarding: review.onboarding,
            careerGrowth: review.careerGrowth,
            benefits: review.benefits,
            workLifeBalance: review.workLifeBalance,
            diversityInclusion: review.diversityInclusion,
            management: review.management,
            product: review.product,
            compensation: review.compensation
          },
          review: {
            id: review.id,
            title: review.title,
            location: review.location,
            timezone: review.timezone,
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
            github: [(organization)-[:HAS_GITHUB]->(github:Github) | github.login][0],
            website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
            discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
            telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
            twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0]
          }
        })) as orgsByRepo, user

        CALL {
          WITH user
          MATCH (organization: Organization)-[:HAS_WEBSITE]->(website: Website)
          MATCH (user)-[:HAS_EMAIL]->(email: UserEmail)
          WHERE email IS NOT NULL AND website IS NOT NULL AND apoc.data.url(website.url).host CONTAINS apoc.data.email(email.email).domain
          OPTIONAL MATCH (user)-[:LEFT_REVIEW]->(review:OrgReview)<-[:HAS_REVIEW]-(organization)
          RETURN apoc.coll.toSet(COLLECT(organization {
            compensation: {
              salary: review.salary,
              currency: review.currency,
              offersTokenAllocation: review.offersTokenAllocation
            },
            rating: {
              onboarding: review.onboarding,
              careerGrowth: review.careerGrowth,
              benefits: review.benefits,
              workLifeBalance: review.workLifeBalance,
              diversityInclusion: review.diversityInclusion,
              management: review.management,
              product: review.product,
              compensation: review.compensation
            },
            review: {
              id: review.id,
              title: review.title,
              location: review.location,
              timezone: review.timezone,
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
              github: [(organization)-[:HAS_GITHUB]->(github:Github) | github.login][0],
              website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
              discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
              telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
              twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0]
            }
          })) as orgsByEmail
        }
        RETURN apoc.coll.union(orgsByRepo, orgsByEmail) as organizations        
      `,
        { wallet },
      );

      const final =
        result?.records[0]
          ?.get("organizations")
          ?.map(record => new UserOrgEntity(record).getProperties()) ?? [];

      return {
        success: true,
        message: "Retrieved user orgs successfully",
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
  ): Promise<ResponseWithOptionalData<UserShowCase[]>> {
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
  ): Promise<ResponseWithOptionalData<UserSkill[]>> {
    try {
      const skills = await this.models.Users.findRelationships({
        alias: "skills",
        where: { source: { wallet: wallet } },
      });

      return {
        success: true,
        message: "User skills retrieved successfully",
        data:
          skills.map(x =>
            new UserSkillEntity({
              ...x.target.getDataValues(),
              canTeach: x.relationship.canTeach,
            }).getProperties(),
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

  async updateDevUserProfile(
    wallet: string,
    dto: UpdateDevUserProfileInput,
  ): Promise<ResponseWithOptionalData<UserProfile>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})
        SET user.available = $availableForWork

        WITH user
        MERGE (user)-[:HAS_CONTACT_INFO]->(contact: UserContactInfo)
        SET contact.preferred = $preferred
        SET contact.value = $value

        WITH user
        MERGE (user)-[:HAS_LOCATION]->(location: UserLocation)
        SET location.country = $country
        SET location.city = $city
        
        WITH user
        RETURN {
          wallet: $wallet,
          availableForWork: user.available,
          email: [(user)-[:HAS_EMAIL]->(email:UserEmail) | email.email][0],
          username: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.login][0],
          avatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
          contact: [(user)-[:HAS_CONTACT_INFO]->(contact: UserContactInfo) | contact { .* }][0],
          location: [(user)-[:HAS_LOCATION]->(location: UserLocation) | location { .* }][0]
        } as profile

      `,
        {
          wallet,
          availableForWork: dto.availableForWork,
          ...dto.contact,
          ...dto.location,
        },
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

  async updateOrgUserProfile(
    wallet: string,
    dto: UpdateOrgUserProfileInput,
  ): Promise<ResponseWithOptionalData<OrgUserProfile>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})
        SET user.linkedin = $linkedin
        SET user.calendly = $calendly

        WITH user
        MERGE (user)-[:HAS_CONTACT_INFO]->(contact: UserContactInfo)
        SET contact.preferred = $preferred
        SET contact.value = $value

        WITH user
        MERGE (user)-[:HAS_INTERNAL_REFERENCE]->(reference: OrgUserReferenceInfo)
        SET reference.referencePersonName = $referencePersonName
        SET reference.referencePersonRole = $referencePersonRole
        SET reference.referenceContact = $referenceContact
        SET reference.referenceContactPlatform = $referenceContactPlatform
        
        WITH user
        RETURN {
          wallet: $wallet,
          linkedin: user.linkedin,
          calendly: user.calendly,
          email: [(user)-[:HAS_EMAIL]->(email:UserEmail) | email.email][0],
          username: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.login][0],
          avatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
          contact: [(user)-[:HAS_CONTACT_INFO]->(contact: UserContactInfo) | contact { .* }][0],
          orgId: [(user)-[:HAS_ORGANIZATION_AUTHORIZATION]->(organization:Organization) | organization.orgId][0],
          internalReference: [(user)-[:HAS_INTERNAL_REFERENCE]->(reference: OrgUserReferenceInfo) | reference { .* }][0],
          subscriberStatus: [(user)-[:HAS_ORGANIZATION_AUTHORIZATION|HAS_SUBSCRIPTION*2]->(subscription:Subscription) | subscription { .* }][0]
        } as profile

      `,
        {
          wallet,
          ...dto,
          ...dto.contact,
          ...dto.internalReference,
        },
      );

      return {
        success: true,
        message: "User profile updated successfully",
        data: new OrgUserProfileEntity(
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
        OPTIONAL MATCH (user)-[cr:HAS_CONTACT_INFO]->(contact: UserContactInfo)
        OPTIONAL MATCH (user)-[rr:LEFT_REVIEW]->(:OrgReview)
        OPTIONAL MATCH (user)-[gr:HAS_GITHUB_USER]->(:GithubUser)
        OPTIONAL MATCH (user)-[scr:HAS_SHOWCASE]->(showcase:UserShowCase)
        OPTIONAL MATCH (user)-[ul:HAS_LOCATION]->(location:UserLocation)
        OPTIONAL MATCH (user)-[sr:HAS_SKILL]->(:Tag)
        OPTIONAL MATCH (user)-[er:HAS_EMAIL]->(email:UserEmail|UserUnverifiedEmail)
        OPTIONAL MATCH (user)-[ja:APPLIED_TO|BOOKMARKED|VIEWED_DETAILS]->()
        OPTIONAL MATCH (user)-[ds:DID_SEARCH]->(search:SearchHistory)
        OPTIONAL MATCH (user)-[cl:HAS_CACHE_LOCK]->(lock:UserCacheLock)
        OPTIONAL MATCH (user)-[oa:HAS_ORGANIZATION_AUTHORIZATION]->()
        OPTIONAL MATCH (user)-[:HAS_WORK_HISTORY]->(wh:UserWorkHistory)-[:WORKED_ON_REPO]->(whr:UserWorkHistoryRepo)
        DETACH DELETE user, cr, contact, rr, gr, scr, showcase, ul, location, sr, er, email, ja, ds, cl, search, lock, oa, wh, whr
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
      const newSkills = dto.skills;
      await this.models.Users.deleteRelationships({
        alias: "skills",
        where: {
          source: {
            wallet: wallet,
          },
        },
      });
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
      const userOrgs = data(await this.getUserOrgs(wallet));
      if (userOrgs?.find(x => x.org.orgId === dto.orgId)) {
        await this.neogma.queryRunner.run(
          `
        MATCH (user:User {wallet: $wallet}), (org:Organization {orgId: $orgId})
        MERGE (user)-[:LEFT_REVIEW]->(review:OrgReview)<-[:HAS_REVIEW]-(org)
        SET review.salary = $salary
        SET review.currency = $currency
        SET review.offersTokenAllocation = $offersTokenAllocation
        SET review.reviewedTimestamp = timestamp()
      `,
          { wallet, ...dto },
        );
        return { success: true, message: "Org salary reviewed successfully" };
      } else {
        return {
          success: false,
          message: "You are unauthorized to perform this action",
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::reviewOrgSalary ${err.message}`);
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
      const userOrgs = data(await this.getUserOrgs(wallet));
      if (userOrgs?.find(x => x.org.orgId === dto.orgId)) {
        await this.neogma.queryRunner.run(
          `
        MATCH (user:User {wallet: $wallet}), (org:Organization {orgId: $orgId})
        MERGE (user)-[:LEFT_REVIEW]->(review:OrgReview)<-[:HAS_REVIEW]-(org)
        SET review.onboarding = $onboarding
        SET review.careerGrowth = $careerGrowth
        SET review.benefits = $benefits
        SET review.workLifeBalance = $workLifeBalance
        SET review.diversityInclusion = $diversityInclusion
        SET review.management = $management
        SET review.product = $product
        SET review.compensation = $compensation
        SET review.reviewedTimestamp = timestamp()
      `,
          { wallet, ...dto },
        );
        return { success: true, message: "Org rated successfully" };
      } else {
        return {
          success: false,
          message: "You are unauthorized to perform this action",
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::rateOrg ${err.message}`);
      return {
        success: false,
        message: "Error rating org",
      };
    }
  }

  async reviewOrg(
    wallet: string,
    dto: ReviewOrgInput,
  ): Promise<ResponseWithNoData> {
    try {
      const userOrgs = data(await this.getUserOrgs(wallet));
      if (userOrgs?.find(x => x.org.orgId === dto.orgId)) {
        await this.neogma.queryRunner.run(
          `
        MATCH (user:User {wallet: $wallet}), (org:Organization {orgId: $orgId})
        MERGE (user)-[:LEFT_REVIEW]->(review:OrgReview)<-[:HAS_REVIEW]-(org)
        SET review.id = randomUUID()
        SET review.title = $title
        SET review.location = $location
        SET review.timezone = $timezone
        SET review.pros = $pros
        SET review.cons = $cons
        SET review.reviewedTimestamp = timestamp()
      `,
          { wallet, ...dto },
        );
        return { success: true, message: "Org reviewed successfully" };
      } else {
        return {
          success: false,
          message: "You are unauthorized to perform this action",
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::reviewOrg ${err.message}`);
      return {
        success: false,
        message: "Error reviewing org",
      };
    }
  }

  async findReviewById(
    id: string,
  ): Promise<ResponseWithOptionalData<OrgStaffReview>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (review:OrgReview {id: $id})<-[:HAS_REVIEW]-(:Organization)
        RETURN {
          id: review.id,
          title: review.title,
          location: review.location,
          timezone: review.timezone,
          pros: review.pros,
          cons: review.cons
        } as review
      `,
        { id },
      );
      const review = result?.records[0]?.get("review");

      if (review) {
        return {
          success: true,
          message: "Review verification successful",
          data: new OrgStaffReviewEntity(review).getProperties(),
        };
      } else {
        return {
          success: false,
          message: "Review not found",
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { id });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::verifyOrgReview ${err.message}`);
      return {
        success: false,
        message: "Error verifying org review",
      };
    }
  }

  async updateRepoContribution(
    wallet: string,
    dto: UpdateRepoContributionInput,
  ): Promise<ResponseWithNoData> {
    try {
      const userRepos = (await this.getUserRepos(wallet, {
        limit: Integer.MAX_SAFE_VALUE.toNumber(),
        page: 1,
      })) as Response<UserRepo[]>;
      if (userRepos.data.find(x => x.id === dto.id)) {
        await this.neogma.queryRunner.run(
          `
        MATCH (:User {wallet: $wallet})-[:HAS_GITHUB_USER]->(:GithubUser)-[r:CONTRIBUTED_TO]->(:GithubRepository {id: $id})
        SET r.summary = $contribution
      `,
          { wallet, ...dto },
        );

        return {
          success: true,
          message: "User repo contribution updated successfully",
        };
      } else {
        return {
          success: false,
          message: "You are unauthorized to perform this action",
        };
      }
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
      const userRepos = (await this.getUserRepos(wallet, {
        limit: Integer.MAX_SAFE_VALUE.toNumber(),
        page: 1,
      })) as Response<UserRepo[]>;
      if (userRepos.data.find(x => x.id === dto.id)) {
        await this.neogma.queryRunner.run(
          `
        MATCH (user:User {wallet: $wallet})
        MATCH (user)-[:HAS_GITHUB_USER]->(ghu:GithubUser)-[:CONTRIBUTED_TO]->(repo:GithubRepository {id: $id})
        OPTIONAL MATCH (ghu)-[r1:USED_TAG]->(tag: Tag)-[r2:USED_ON]->(repo)
        DETACH DELETE r1,r2

        WITH ghu, user
        UNWIND $tagsUsed as data
        WITH data, ghu, user
        MATCH (repo:GithubRepository {id: $id}), (tag: Tag {normalizedName: data.normalizedName})
        MERGE (user)-[s:HAS_SKILL]->(tag)
        SET s.canTeach = data.canTeach
        MERGE (ghu)-[:USED_TAG]->(tag)-[:USED_ON]->(repo)
      `,
          { wallet, ...dto },
        );

        return {
          success: true,
          message: "User repo tags used updated successfully",
        };
      } else {
        return {
          success: false,
          message: "You are unauthorized to perform this action",
        };
      }
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

  async getUserCacheLock(wallet: string): Promise<number | null> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (:User {wallet: $wallet})-[:HAS_CACHE_LOCK]->(lock: UserCacheLock)
        RETURN lock.timestamp as timestamp
      `,
        { wallet },
      );
      return nonZeroOrNull(result.records[0]?.get("timestamp"));
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::getUserCacheLock ${err.message}`);
      return -1;
    }
  }

  async refreshUserCacheLock(wallets: string[]): Promise<number | null> {
    try {
      await this.neogma.queryRunner.run(
        `
        OPTIONAL MATCH (oldUser:User WHERE oldUser.wallet IN $wallets)-[r:HAS_CACHE_LOCK]->(oldLock: UserCacheLock)
        DETACH DELETE oldLock, r
      `,
        { wallets },
      );
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User WHERE user.wallet IN $wallets)
        CREATE (lock: UserCacheLock)
        SET lock.timestamp = timestamp()

        WITH user, lock
        CREATE (user)-[:HAS_CACHE_LOCK]->(lock)
        RETURN lock.timestamp as timestamp
        `,
        { wallets },
      );
      return intConverter(result.records[0]?.get("timestamp"));
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallets });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::refreshUserCacheLock ${err.message}`);
      return -1;
    }
  }

  async refreshWorkHistoryCache(
    wallet: string,
    dto: UserWorkHistory[],
  ): Promise<ResponseWithNoData> {
    const isCryptoNative = dto.some(x =>
      x.repositories.some(repo => repo.cryptoNative),
    );
    try {
      await this.neogma.queryRunner.run(
        `
        OPTIONAL MATCH (user:User {wallet: $wallet})-[:HAS_WORK_HISTORY]->(oldHistory: UserWorkHistory)-[:WORKED_ON_REPO]->(oldHistoryRepo: UserWorkHistoryRepo)
        DETACH DELETE oldHistory, oldHistoryRepo
      `,
        { wallet },
      );
      await this.neogma.queryRunner.run(
        `
        UNWIND $history as workHistory
        CALL {
          WITH workHistory
          CREATE (history: UserWorkHistory)
          SET history.login = workHistory.login
          SET history.name = workHistory.name
          SET history.logoUrl = workHistory.logoUrl
          SET history.url = workHistory.url
          SET history.firstContributedAt = workHistory.firstContributedAt
          SET history.lastContributedAt = workHistory.lastContributedAt
          SET history.createdAt = timestamp()

          WITH workHistory, history
          UNWIND workHistory.repositories as repo
          CREATE (historyRepo: UserWorkHistoryRepo)
          SET historyRepo.name = repo.name
          SET historyRepo.url = repo.url
          SET historyRepo.cryptoNative = repo.cryptoNative
          SET historyRepo.firstContributedAt = repo.firstContributedAt
          SET historyRepo.lastContributedAt = repo.lastContributedAt
          SET historyRepo.commitsCount = repo.commitsCount
          SET historyRepo.createdAt = timestamp()

          WITH history, historyRepo
          CREATE (history)-[:WORKED_ON_REPO]->(historyRepo)
          RETURN history
        }

        WITH history

        MATCH (user: User {wallet: $wallet})
        SET user.cryptoNative = $cryptoNative
        CREATE (user)-[:HAS_WORK_HISTORY]->(history)
        `,
        { wallet, history: dto ?? [], cryptoNative: isCryptoNative },
      );
      return {
        success: true,
        message: "Persisted user work history successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, dto });
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProfileService::refreshWorkHistoryCache ${err.message}`,
      );
      return {
        success: false,
        message: "Error caching work history",
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
        MERGE (user)-[r:BLOCKED_ORG_JOBS]->(org)
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
        MERGE (user)-[r:APPLIED_TO]->(job)
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
        MERGE (user)-[r:BOOKMARKED]->(job)
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
        MERGE (user)-[r:VIEWED_DETAILS]->(job)
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
        MERGE (user)-[r:DID_SEARCH]->(:SearchHistory {query: $query})
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
