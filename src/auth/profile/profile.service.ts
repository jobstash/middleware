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
  UserWorkHistoryEntity,
} from "src/shared/entities";
import {
  normalizeString,
  paginate,
  intConverter,
  nonZeroOrNull,
} from "src/shared/helpers";
import {
  AdjacentRepo,
  OrgStaffReview,
  OrgUserProfile,
  PaginatedData,
  Response,
  ResponseWithNoData,
  ResponseWithOptionalData,
  UserGithubOrganization,
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
import { ScorerService } from "src/scorer/scorer.service";
import { ConfigService } from "@nestjs/config";
import { addMonths, isBefore } from "date-fns";
import { PrivyService } from "../privy/privy.service";
import { UpdateDevLinkedAccountsInput } from "./dto/update-dev-linked-accounts.input";
import { UpdateDevLocationInput } from "./dto/update-dev-location.input";

@Injectable()
export class ProfileService {
  private readonly logger = new CustomLogger(ProfileService.name);

  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private models: ModelService,
    private scorerService: ScorerService,
    private configService: ConfigService,
    private privyService: PrivyService,
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
          name: user.name,
          githubAvatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
          alternateEmails: [(user)-[:HAS_EMAIL]->(email:UserEmail) | email.email],
          linkedAccounts: [(user)-[:HAS_LINKED_ACCOUNT]->(account: LinkedAccount) | account {
            .*,
            wallets: [(user)-[:HAS_LINKED_WALLET]->(wallet:LinkedWallet) | wallet.address]
          }][0],
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
          username: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.login][0],
          avatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
          linkedWallets: [(user)-[:HAS_LINKED_WALLET]->(wallet:LinkedWallet) | wallet.address],
          linkedAccounts: [(user)-[:HAS_LINKED_ACCOUNT]->(account: LinkedAccount) | account { .* }][0],
          email: [(user)-[:HAS_EMAIL]->(email:UserEmail) | email { email: email.email, main: email.main }],
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
          org: [(organization: Organization)-[:HAS_GITHUB|HAS_REPOSITORY*2]->(repo) | organization {
            url: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
            name: organization.name,
            logo: organization.logo
          }][0],
          tags: apoc.coll.toSet([(gu)-[:USED_TAG]->(tag: Tag)-[:USED_ON]->(repo) WHERE (user)-[:HAS_SKILL]->(tag) | tag {
            .*,
            canTeach: [(user)-[m:HAS_SKILL]->(tag)-[:USED_ON]->(repo) | m.canTeach][0]
          }]),
          contribution: r.summary
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

  async getUserWorkHistory(
    wallet: string,
  ): Promise<ResponseWithOptionalData<UserWorkHistory[]>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})-[:HAS_WORK_HISTORY]->(history: UserWorkHistory)
        RETURN history {
          login: history.login,
          name: history.name,
          logoUrl: history.logoUrl,
          description: history.description,
          url: history.url,
          firstContributedAt: history.firstContributedAt,
          lastContributedAt: history.lastContributedAt,
          commitsCount: history.commitsCount,
          tenure: history.tenure,
          createdAt: history.createdAt,
          repositories: [
            (history)-[:WORKED_ON_REPO]->(repo: UserWorkHistoryRepo) | repo {
              name: repo.name,
              description: repo.description,
              cryptoNative: repo.cryptoNative,
              firstContributedAt: repo.firstContributedAt,
              lastContributedAt: repo.lastContributedAt,
              commitsCount: repo.commitsCount,
              createdAt: repo.createdAt,
              skills: repo.skills,
              tenure: repo.tenure,
              stars: repo.stars,
              url: repo.url
            }
          ]
        } as history
      `,
        { wallet },
      );
      return {
        success: true,
        message: "Retrieved user work history successfully",
        data: result.records.map(record =>
          new UserWorkHistoryEntity(record.get("history")).getProperties(),
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
      this.logger.error(`ProfileService::getUserWorkHistory ${err.message}`);
      return {
        success: false,
        message: "Error retrieving user work history",
      };
    }
  }

  async getUserOrgs(
    wallet: string,
  ): Promise<ResponseWithOptionalData<UserOrg[]>> {
    try {
      const profile = data(await this.getDevUserProfile(wallet));
      const orgs = [];

      if (profile?.linkedAccounts.github) {
        const cached = await this.getUserWorkHistory(wallet);
        let prelim: UserWorkHistory[] = [];
        if (cached.success && data(cached).length > 0) {
          prelim = data(cached);
        } else {
          await this.runUserDataFetchingOps(wallet, true);
          prelim = data(await this.getUserWorkHistory(wallet));
        }
        const names = prelim.map(x => x.name);
        const result = await this.neogma.queryRunner.run(
          `
            MATCH (user:User {wallet: $wallet}), (organization: Organization WHERE organization.name IN $names)
            OPTIONAL MATCH (user)-[:LEFT_REVIEW]->(review:OrgReview)<-[:HAS_REVIEW]-(organization)
            RETURN apoc.coll.toSet(COLLECT({
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
              org: organization {
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
                github: [(organization)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
                website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
                discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
                telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
                twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0]
              }
            })) as orgsByRepo
          `,
          { wallet, names },
        );
        const orgsByRepo =
          result?.records[0]
            ?.get("orgsByRepo")
            .map(record => new UserOrgEntity(record).getProperties()) ?? [];
        const processed = orgsByRepo.map(x => ({
          ...x,
          org: {
            ...x.org,
            github:
              x.org.github ?? prelim.find(y => y.name === x.org.name)?.login,
          },
        }));
        orgs.push(...processed);
      }

      if (profile?.linkedAccounts.email || profile.alternateEmails.length > 0) {
        const result = await this.neogma.queryRunner.run(
          `
            MATCH (user:User {wallet: $wallet})
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
                  github: [(organization)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
                  website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
                  discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
                  telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
                  twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0]
                }
            })) as orgsByEmail
          `,
          { wallet },
        );
        const orgsByEmail =
          result?.records[0]
            ?.get("orgsByEmail")
            .map(record => new UserOrgEntity(record).getProperties()) ?? [];
        orgsByEmail.forEach(x => {
          const exists = orgs.some(y => y.org.orgId === x.org.orgId);
          if (!exists) {
            orgs.push(x);
          }
        });
      }

      return {
        success: true,
        message: "Retrieved user orgs successfully",
        data: orgs,
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

  async updateDevUserLinkedAccounts(
    wallet: string,
    dto: UpdateDevLinkedAccountsInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
          MATCH (user:User {wallet: $wallet})

          WITH user
          MERGE (user)-[:HAS_LINKED_ACCOUNT]->(account: LinkedAccount)
          ON CREATE SET
            account += $dto,
            account.createdTimestamp = timestamp()
          ON MATCH SET
            account += $dto,
            account.updatedTimestamp = timestamp()
        `,
        { wallet, dto },
      );
      return {
        success: true,
        message: "User linked accounts updated successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "profiles.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProfileService::updateDevUserLinkedAccounts ${err.message}`,
      );
      return {
        success: false,
        message: "Error updating user linked accounts",
      };
    }
  }

  async updateDevUserLocationInfo(
    wallet: string,
    dto: UpdateDevLocationInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
          MATCH (user:User {wallet: $wallet})

          WITH user
          MERGE (user)-[:HAS_LOCATION]->(location: UserLocation)
          ON CREATE SET
            location += $location,
            location.createdTimestamp = timestamp()
          ON MATCH SET
            location += $location,
            location.updatedTimestamp = timestamp()
        `,
        { wallet },
      );
      return {
        success: true,
        message: "User location info updated successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "profiles.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProfileService::updateDevUserLocationInfo ${err.message}`,
      );
      return {
        success: false,
        message: "Error updating user location info",
      };
    }
  }

  async updateDevUserAvailability(
    wallet: string,
    availability: boolean,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})
        SET user.available = $availableForWork
        SET user.updatedTimestamp = timestamp()

      `,
        {
          wallet,
          availableForWork: availability,
        },
      );

      return {
        success: true,
        message: "User profile updated successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, availability });
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
          linkedWallets: [(user)-[:HAS_LINKED_WALLET]->(wallet:LinkedWallet) | wallet.address],
          username: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.login][0],
          avatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
          contact: [(user)-[:HAS_CONTACT_INFO]->(contact: UserContactInfo) | contact { .* }][0],
          email: [(user)-[:HAS_EMAIL]->(email:UserEmail) | email { email: email.email, main: email.main }],
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

  async getPrivyId(wallet: string): Promise<string | undefined> {
    const result = await this.neogma.queryRunner
      .run(
        `
          MATCH (u:User {wallet:$wallet})
          RETURN u.privyId as privyId
        `,
        { wallet },
      )
      .then(res =>
        res.records.length ? res.records[0].get("privyId") : undefined,
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "profile.service",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`ProfileService::getPrivyId ${err.message}`);
        return undefined;
      });
    return result;
  }

  async runUserDataFetchingOps(
    wallet: string,
    skipCache = false,
  ): Promise<void> {
    const CACHE_VALIDITY_THRESHOLD = this.configService.get<number>(
      "CACHE_VALIDITY_THRESHOLD",
    );

    const profile = data(await this.getDevUserProfile(wallet));

    const userCacheLock = await this.getUserCacheLock(wallet);

    const userCacheLockIsValid =
      (userCacheLock !== -1 || userCacheLock !== null) &&
      isBefore(
        new Date(),
        addMonths(new Date(userCacheLock), CACHE_VALIDITY_THRESHOLD),
      );

    if (!userCacheLockIsValid || skipCache) {
      if (!skipCache) {
        this.logger.log(
          `/profile/refresh-work-history-cache: User cache lock is invalid for wallet ${wallet}. Refreshing...`,
        );
      } else {
        this.logger.log(
          `/profile/refresh-work-history-cache: User cache lock is being hard reset for wallet ${wallet}. Refreshing...`,
        );
      }
      try {
        const privyId = await this.getPrivyId(wallet);
        const wallets = await this.privyService.getUserLinkedWallets(privyId);
        const workHistory = (
          await this.scorerService.getUserWorkHistories([
            { github: profile?.linkedAccounts.github, wallets },
          ])
        )[0];
        await this.refreshWorkHistoryCache(
          wallet,
          workHistory.cryptoNative,
          workHistory.workHistory,
          workHistory.adjacentRepos,
        );

        await this.refreshUserRepoCache(
          wallet,
          workHistory.workHistory.map(x => {
            const repos = x.repositories.map(repo => ({
              name: repo.name,
              description: repo.description,
            }));
            return {
              login: x.login,
              name: x.name,
              description: x.description,
              avatar_url: x.logoUrl,
              repositories: repos,
            };
          }),
        );
        await this.refreshUserCacheLock([wallet]);
      } catch (err) {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-call",
            source: "profile.service",
          });
          Sentry.captureException(err);
        });
        this.logger.error(
          `/profile/refresh-work-history-cache: ${err.message}`,
        );
      }
    } else {
      this.logger.log(
        `/profile/refresh-work-history-cache: User cache lock is still valid for wallet ${wallet}. Skipping...`,
      );
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
    cryptoNative: boolean,
    workHistory: UserWorkHistory[],
    adjacentRepos: AdjacentRepo[],
  ): Promise<ResponseWithNoData> {
    const isCryptoNative = cryptoNative;
    const isCryptoAdjacent = adjacentRepos.length > 0;

    this.logger.log(
      `/profile/refresh-work-history-cache ${JSON.stringify({
        wallet,
        isCryptoNative,
        isCryptoAdjacent,
      })}`,
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
        MATCH (user: User {wallet: $wallet})
        SET user.cryptoNative = $cryptoNative
        SET user.cryptoAdjacent = $cryptoAdjacent

        WITH user

        UNWIND $history as workHistory
        CALL {
          WITH workHistory
          CREATE (history: UserWorkHistory)
          SET history.login = workHistory.login
          SET history.name = workHistory.name
          SET history.logoUrl = workHistory.logoUrl
          SET history.description = workHistory.description
          SET history.url = workHistory.url
          SET history.firstContributedAt = workHistory.firstContributedAt
          SET history.lastContributedAt = workHistory.lastContributedAt
          SET history.commitsCount = workHistory.commitsCount
          SET history.tenure = workHistory.tenure
          SET history.cryptoNative = workHistory.cryptoNative
          SET history.createdAt = timestamp()

          WITH workHistory, history
          UNWIND workHistory.repositories as repo
          CREATE (historyRepo: UserWorkHistoryRepo)
          SET historyRepo.name = repo.name
          SET historyRepo.url = repo.url
          SET historyRepo.description = repo.description
          SET historyRepo.cryptoNative = repo.cryptoNative
          SET historyRepo.firstContributedAt = repo.firstContributedAt
          SET historyRepo.lastContributedAt = repo.lastContributedAt
          SET historyRepo.commitsCount = repo.commitsCount
          SET historyRepo.skills = repo.skills
          SET historyRepo.tenure = repo.tenure
          SET historyRepo.stars = repo.stars
          SET historyRepo.createdAt = timestamp()

          WITH history, historyRepo
          MERGE (history)-[:WORKED_ON_REPO]->(historyRepo)
          RETURN history
        }

        WITH history, user
        MERGE (user)-[:HAS_WORK_HISTORY]->(history)
        `,
        {
          wallet,
          history: workHistory ?? [],
          cryptoNative: isCryptoNative,
          cryptoAdjacent: isCryptoAdjacent,
        },
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
        scope.setExtra("input", { wallet, dto: workHistory });
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

  async refreshUserRepoCache(
    wallet: string,
    dto: UserGithubOrganization[],
  ): Promise<ResponseWithNoData> {
    try {
      for (const org of dto) {
        const processed = {
          ...org,
          repositories: org.repositories.map(repo => ({
            ...repo,
            nameWithOwner: `${org.login}/${repo.name}`,
          })),
        };
        await this.neogma.queryRunner.run(
          `
            MATCH (user:User {wallet: $wallet})-[:HAS_GITHUB_USER]->(ghu:GithubUser)
            OPTIONAL MATCH (ghu)-[r:CONTRIBUTED_TO]->(repo: GithubRepository)
            DETACH DELETE r
          `,
          { wallet },
        );
        await this.neogma.queryRunner.run(
          `
            MATCH (user:User {wallet: $wallet})-[:HAS_GITHUB_USER]->(ghu:GithubUser)
            
            UNWIND $org.repositories as orgRepo
            MERGE (ghu)-[:CONTRIBUTED_TO]->(repo: GithubRepository {nameWithOwner: orgRepo.nameWithOwner})
            ON CREATE SET
              repo.id = randomUUID(),
              repo.name = orgRepo.name,
              repo.nameWithOwner = orgRepo.nameWithOwner,
              repo.description = orgRepo.description,
              repo.createdTimestamp = timestamp(),
              repo.updatedTimestamp = timestamp()
            ON MATCH SET
              repo.description = orgRepo.description,
              repo.updatedTimestamp = timestamp()
            
            WITH repo
            MATCH (gho:GithubOrganization {login: $org.login})
            MERGE (gho)-[:HAS_REPOSITORY]->(repo)
          `,
          { wallet, org: { ...processed } },
        );
      }
      return {
        success: true,
        message: "Persisted user repos successfully",
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
      this.logger.error(`ProfileService::refreshUserRepoCache ${err.message}`);
      return {
        success: false,
        message: "Error caching user repos",
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
