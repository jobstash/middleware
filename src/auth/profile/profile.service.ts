import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import axios from "axios";
import { now, uniqBy } from "lodash";
import { ProfileRepository } from "src/postgres/profile.repository";
import { UserRepository } from "src/postgres/user.repository";
import { ScorerService } from "src/scorer/scorer.service";
import {
  UserOrgEntity,
  UserProfileEntity,
  UserRepoEntity,
  UserShowCaseEntity,
  UserSkillEntity,
  UserWorkHistoryEntity,
} from "src/shared/entities";
import { OrgStaffReviewEntity } from "src/shared/entities/org-staff-review.entity";
import { paginate, slugify } from "src/shared/helpers";
import {
  AdjacentRepo,
  EcosystemActivation,
  OrgStaffReview,
  PaginatedData,
  ResponseWithNoData,
  ResponseWithOptionalData,
  UserGithubOrganization,
  UserOrg,
  UserProfile,
  UserRepo,
  UserShowCase,
  UserSkill,
  UserVerificationStatus,
  UserVerifiedOrg,
  UserWorkHistory,
  data,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { GithubUserService } from "../github/github-user.service";
import { RateOrgInput } from "./dto/rate-org.input";
import { RepoListParams } from "./dto/repo-list.input";
import { ReviewOrgSalaryInput } from "./dto/review-org-salary.input";
import { ReviewOrgInput } from "./dto/review-org.input";
import { UpdateDevLocationInput } from "./dto/update-dev-location.input";
import { UpdateRepoContributionInput } from "./dto/update-repo-contribution.input";
import { UpdateRepoTagsUsedInput } from "./dto/update-repo-tags-used.input";
import { UpdateUserShowCaseInput } from "./dto/update-user-showcase.input";
import { UpdateUserSkillsInput } from "./dto/update-user-skills.input";
import { addDays } from "date-fns";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class ProfileService {
  private readonly logger = new CustomLogger(ProfileService.name);

  constructor(
    private readonly profiles: ProfileRepository,
    private readonly users: UserRepository,
    private scorerService: ScorerService,
    private configService: ConfigService,
    private githubUserService: GithubUserService,
  ) {}

  async getUserProfile(
    wallet: string,
  ): Promise<ResponseWithOptionalData<UserProfile>> {
    if (wallet) {
      try {
        const profile = await this.users.getProfile(wallet);

        return {
          success: true,
          message: "User Profile retrieved successfully",
          data: profile
            ? new UserProfileEntity(
                profile as unknown as UserProfile,
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
        this.logger.error(`ProfileService::getUserProfile ${err.message}`);
        return {
          success: false,
          message: "Error retrieving user profile",
        };
      }
    } else {
      return {
        success: false,
        message: "Invalid wallet",
      };
    }
  }

  async getUserRepos(
    wallet: string,
    params: RepoListParams,
  ): Promise<PaginatedData<UserRepo> | ResponseWithNoData> {
    try {
      const final = (await this.profiles.getUserRepos(wallet)).map(repo =>
        new UserRepoEntity(repo as unknown as UserRepo).getProperties(),
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
      const orgs = (await this.profiles.getReviewedOrganizations(wallet)).map(
        organization =>
          new UserOrgEntity(organization as unknown as UserOrg).getProperties(),
      );

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

  private async refetchUserVerifications(
    wallet: string,
    withEcosystemActivations = false,
  ): Promise<UserVerifiedOrg[]> {
    try {
      const profile = data(await this.getUserProfile(wallet));
      if (profile) {
        const orgs: UserVerifiedOrg[] = [];

        this.logger.log(`Fetching work history for ${wallet}`);
        const workHistory = await this.getUserWorkHistory(wallet, true);
        const prelim: UserWorkHistory[] = workHistory?.workHistory ?? [];

        if (profile?.linkedAccounts?.github) {
          this.logger.log(
            `Fetching org verifications for ${wallet} based on github username`,
          );
          const names = prelim.map(x => x.name);
          const orgsByRepo =
            await this.profiles.findVerificationOrganizationsByNames(
              wallet,
              names,
            );
          const processed = orgsByRepo.map(raw => {
            const x = raw as unknown as UserVerifiedOrg;
            return new UserVerifiedOrg({
              id: x.id,
              name: x.name,
              slug: slugify(x.name),
              url: x.url,
              logo: x.logo ?? null,
              account: profile.linkedAccounts.github,
              hasOwner: x.hasOwner,
              isOwner: x.isOwner,
              isMember: x.isMember,
              credential: "github",
            });
          });
          orgs.push(...processed);
        }

        const emails = [
          ...profile.alternateEmails,
          profile?.linkedAccounts?.email,
          profile?.linkedAccounts?.google,
        ].filter((email): email is string => Boolean(email));

        if (emails.length > 0) {
          this.logger.log(
            `Fetching org verifications for ${wallet} based on email`,
          );
          const orgsByEmail =
            await this.profiles.findVerificationOrganizationsByEmails(
              wallet,
              emails,
            );
          orgsByEmail.forEach(raw => {
            const x = raw as unknown as UserVerifiedOrg;
            const exists = orgs.some(y => y.id === x.id);
            if (!exists) {
              orgs.push(
                new UserVerifiedOrg({
                  id: x.id,
                  name: x.name,
                  slug: slugify(x.name),
                  url: x.url,
                  logo: x.logo ?? null,
                  account: x.account,
                  isMember: x.isMember,
                  hasOwner: x.hasOwner,
                  isOwner: x.isOwner,
                  credential: "email",
                }),
              );
            }
          });
        }

        this.logger.log(
          `Found ${orgs.length === 1 ? `${orgs.length} verification` : `${orgs.length > 0 ? orgs.length : "no"} verifications`} for ${wallet}`,
        );

        this.logger.log(`Persisting user verifications for ${wallet}`);

        await this.profiles.replaceVerifications(wallet, orgs);

        this.logger.log(`Persisted user verifications for ${wallet}`);

        await this.refreshUserCacheLock([wallet]);

        if (
          withEcosystemActivations &&
          (workHistory?.wallets?.length ?? 0) > 0
        ) {
          this.logger.log(
            `Fetching verifications for ${wallet} based on ecosystem activations`,
          );
          const mapped: UserVerifiedOrg[] =
            workHistory?.wallets?.flatMap(x =>
              x.ecosystemActivations.map(
                y =>
                  new UserVerifiedOrg({
                    id: y.id,
                    name: y.name,
                    slug: slugify(y.name),
                    url: "http://ethglobal.com/packs",
                    logo: "http://ethglobal.com",
                    account: x.address,
                    hasOwner: true,
                    isOwner: true,
                    isMember: true,
                    credential: "ecosystemActivation",
                  }),
              ),
            ) ?? [];
          mapped.forEach(x => {
            const exists = orgs.some(y => y.id === x.id);
            if (!exists) {
              orgs.push(x);
            }
          });
        }
        return orgs;
      } else {
        return [];
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet });
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProfileService::refreshUserVerifications ${err.message}`,
      );
      return [];
    }
  }

  async getUserVerifications(
    wallet: string,
    bypassCache = false,
    withEcosystemActivations = false,
  ): Promise<ResponseWithOptionalData<UserVerifiedOrg[]>> {
    const cacheLock = await this.getUserCacheLock(wallet);
    if (bypassCache || !cacheLock || cacheLock <= now()) {
      this.logger.log(`Refreshing user verifications for ${wallet}`);
      const verifications = await this.refetchUserVerifications(
        wallet,
        withEcosystemActivations,
      );
      return {
        success: true,
        message: "Retrieved user verifications successfully",
        data: verifications,
      };
    } else {
      this.logger.log(`Fetching cached user orgs verifications for ${wallet}`);
      try {
        const verifications = (
          await this.profiles.getVerifications(wallet)
        ).map(
          verification =>
            new UserVerifiedOrg(verification as unknown as UserVerifiedOrg),
        );
        if (withEcosystemActivations) {
          const workHistory = await this.getUserWorkHistory(wallet);
          if ((workHistory?.wallets?.length ?? 0) > 0) {
            this.logger.log(
              `Fetching verifications for ${wallet} based on ecosystem activations`,
            );
            const mapped: UserVerifiedOrg[] =
              workHistory?.wallets?.flatMap(x =>
                x.ecosystemActivations.map(
                  y =>
                    new UserVerifiedOrg({
                      id: y.id,
                      name: y.name,
                      slug: slugify(y.name),
                      url: "http://ethglobal.com/packs",
                      logo: "http://ethglobal.com",
                      account: x.address,
                      hasOwner: true,
                      isOwner: true,
                      isMember: true,
                      credential: "ecosystemActivation",
                    }),
                ),
              ) ?? [];
            mapped.forEach(x => {
              const exists = verifications.some(y => y.id === x.id);
              if (!exists) {
                verifications.push(x);
              }
            });
          }
        }
        return {
          success: true,
          message: "Retrieved user verifications successfully",
          data: verifications,
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
        this.logger.error(
          `ProfileService::getUserVerifications ${err.message}`,
        );
        return {
          success: false,
          message: "Error retrieving user verifications",
        };
      }
    }
  }

  async updateUserVerificationStatus(
    wallet: string,
    status: "PENDING" | "VERIFIED" | "REJECTED",
    timestamp?: number,
  ): Promise<ResponseWithNoData> {
    try {
      const updated = await this.profiles.setVerificationStatus(
        wallet,
        status,
        status === "VERIFIED" ? timestamp : null,
      );
      return {
        success: updated,
        message: updated
          ? "User verification status updated successfully"
          : "User not found",
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, status, timestamp });
        Sentry.captureException(error);
      });
      this.logger.error(
        `ProfileService::updateUserVerificationStatus ${error.message}`,
      );
      return {
        success: false,
        message: "Error updating user verification status",
      };
    }
  }

  async getUserVerificationStatus(
    wallet: string,
  ): Promise<ResponseWithOptionalData<UserVerificationStatus>> {
    try {
      const result = await this.profiles.getVerificationStatus(wallet);
      const status = result
        ? new UserVerificationStatus(
            result as unknown as UserVerificationStatus,
          )
        : undefined;
      return {
        success: !!status,
        message: status
          ? "User verification status retrieved successfully"
          : "User verification status not found",
        data: status,
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet });
        Sentry.captureException(error);
      });
      this.logger.error(
        `ProfileService::getUserVerificationStatus ${error.message}`,
      );
      return {
        success: false,
        message: "Error getting user verification status",
      };
    }
  }

  async getUserShowCase(
    wallet: string,
  ): Promise<ResponseWithOptionalData<UserShowCase[]>> {
    try {
      const showcases = await this.profiles.getShowcases(wallet);

      return {
        success: true,
        message: "User showcase retrieved successfully",
        data: showcases.map(x =>
          new UserShowCaseEntity(x as unknown as UserShowCase).getProperties(),
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
      const skills = await this.profiles.getSkills(wallet);
      return {
        success: true,
        message: "Retrieved user skills successfully",
        data: uniqBy(
          skills.map(skill =>
            new UserSkillEntity(skill as unknown as UserSkill).getProperties(),
          ),
          "id",
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
      this.logger.error(`ProfileService::getUserSkills ${err.message}`);
      return {
        success: false,
        message: "Error getting user skills",
      };
    }
  }

  async updateUserLinkedAccounts(
    wallet: string,
    contact: {
      discord: string | null;
      telegram: string | null;
      twitter: string | null;
      email: string | null;
      farcaster: string | null;
      github: string | null;
      google: string | null;
      apple: string | null;
    },
  ): Promise<ResponseWithNoData> {
    try {
      const profile = data(await this.getUserProfile(wallet));
      this.logger.log(`Updating linked accounts for ${wallet}`);

      if (
        profile?.linkedAccounts.github &&
        (profile?.linkedAccounts.github !== contact.github || !contact.github)
      ) {
        this.logger.log(`Unlinking github user`);
        await this.githubUserService.removeGithubInfoFromUser(wallet);
      }

      if (contact.github) {
        this.logger.log(`Fetching github info for user`);
        const githubUser = axios
          .get<{
            avatar_url: string;
          }>(`https://api.github.com/users/${contact.github}`)
          .catch(err => {
            this.logger.error(`UserService::fetchGithubUser ${err.message}`);
            this.logger.error(err);
            Sentry.withScope(scope => {
              scope.setTags({
                action: "external-api-call",
                source: "user.service",
              });
              Sentry.captureException(err);
            });
            return undefined;
          });

        const result = await this.githubUserService.addGithubInfoToUser({
          wallet,
          githubLogin: contact.github,
          githubAvatarUrl: (await githubUser)?.data?.avatar_url ?? null,
        });
        if (result.success) {
          this.logger.log(`Github info added to user`);
        } else {
          this.logger.error(`Github info not added to user: ${result.message}`);
          return result;
        }
      }
      const updated = await this.profiles.updateLinkedAccount(wallet, contact);
      return {
        success: updated,
        message: updated
          ? "User linked accounts updated successfully"
          : "User not found",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "profiles.service",
        });
        scope.setExtra("input", { wallet });
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

  async updateUserLocationInfo(
    wallet: string,
    dto: UpdateDevLocationInput,
  ): Promise<ResponseWithNoData> {
    try {
      const updated = await this.profiles.updateLocation(wallet, { ...dto });
      return {
        success: updated,
        message: updated
          ? "User location info updated successfully"
          : "User not found",
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

  async updateUserAvailability(
    wallet: string,
    availability: boolean,
  ): Promise<ResponseWithNoData> {
    try {
      const updated = await this.profiles.updateAvailability(
        wallet,
        availability,
      );

      return {
        success: updated,
        message: updated
          ? "User profile updated successfully"
          : "User not found",
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

  async updateUserShowCase(
    wallet: string,
    dto: UpdateUserShowCaseInput,
  ): Promise<ResponseWithNoData> {
    try {
      const updated = await this.profiles.replaceShowcases(
        wallet,
        dto.showcase,
      );
      return {
        success: updated,
        message: updated
          ? "User showcase updated successfully"
          : "User not found",
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
      const updated = await this.profiles.replaceSkills(
        wallet,
        dto.skills.map(skill => ({
          id: skill.id,
          normalizedName: slugify(skill.name),
          canTeach: skill.canTeach,
        })),
      );

      return {
        success: updated,
        message: updated
          ? "User skills updated successfully"
          : "User not found",
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
      const userOrgs = data(await this.getUserVerifications(wallet));
      if (userOrgs?.find(x => x.id === dto.orgId)) {
        const updated = await this.profiles.upsertReview(wallet, dto.orgId, {
          salary: dto.salary,
          currency: dto.currency,
          offersTokenAllocation: dto.offersTokenAllocation,
        });
        return {
          success: updated,
          message: updated
            ? "Org salary reviewed successfully"
            : "User or organization not found",
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
      const userOrgs = data(await this.getUserVerifications(wallet));
      if (userOrgs?.find(x => x.id === dto.orgId)) {
        const { orgId, ...rating } = dto;
        const updated = await this.profiles.upsertReview(wallet, orgId, rating);
        return {
          success: updated,
          message: updated
            ? "Org rated successfully"
            : "User or organization not found",
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
      const userOrgs = data(await this.getUserVerifications(wallet));
      if (userOrgs?.find(x => x.id === dto.orgId)) {
        const { orgId, ...review } = dto;
        const updated = await this.profiles.upsertReview(wallet, orgId, review);
        return {
          success: updated,
          message: updated
            ? "Org reviewed successfully"
            : "User or organization not found",
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
      const review = await this.profiles.findReview(id);

      if (review) {
        return {
          success: true,
          message: "Review verification successful",
          data: new OrgStaffReviewEntity(
            review as unknown as OrgStaffReview,
          ).getProperties(),
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
      const updated = await this.profiles.updateRepoContribution(
        wallet,
        dto.id,
        dto.contribution,
      );
      if (updated) {
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
      const updated = await this.profiles.updateRepoTags(
        wallet,
        dto.id,
        dto.tagsUsed,
      );
      if (updated) {
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
    const result = await this.users.findPrivyId(wallet).catch(err => {
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

  private async getCachedWorkHistory(wallet: string): Promise<
    | {
        username: string | null;
        wallets: {
          address: string;
          ecosystemActivations: EcosystemActivation[];
        }[];
        cryptoNative: boolean;
        workHistory: UserWorkHistory[];
        adjacentRepos: AdjacentRepo[];
      }
    | undefined
  > {
    try {
      const profile = data(await this.getUserProfile(wallet));
      if (profile) {
        const wallets =
          data(
            await this.scorerService.getEcosystemActivationsForWallets(
              profile?.linkedAccounts?.wallets ?? [],
              null,
            ),
          ) ?? [];
        const workHistory = await this.getUserWorkHistoryCache(wallet);
        const adjacentRepos = await this.getUserAdjacentReposCache(wallet);
        return {
          username: profile?.linkedAccounts?.github,
          wallets: wallets.map(x => ({
            address: x.wallet,
            ecosystemActivations: x.ecosystemActivations,
          })),
          cryptoNative: profile?.cryptoNative ?? false,
          workHistory,
          adjacentRepos,
        };
      } else {
        return undefined;
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::getCachedWorkHistory ${err.message}`);
      return undefined;
    }
  }

  async getUserWorkHistory(
    wallet: string,
    bypassCache = false,
  ): Promise<
    | {
        username: string | null;
        wallets: {
          address: string;
          ecosystemActivations: EcosystemActivation[];
        }[];
        cryptoNative: boolean;
        workHistory: UserWorkHistory[];
        adjacentRepos: AdjacentRepo[];
      }
    | undefined
  > {
    try {
      const profile = data(await this.getUserProfile(wallet));
      if (profile) {
        const cacheLock = await this.getUserCacheLock(wallet);
        if (bypassCache || cacheLock <= now()) {
          const workHistory = (
            await this.scorerService.getUserWorkHistories([
              {
                github: profile?.linkedAccounts?.github,
                wallets: profile?.linkedAccounts?.wallets ?? [],
              },
            ])
          )[0];
          const emails = [
            ...profile.alternateEmails,
            profile?.linkedAccounts?.email,
            profile?.linkedAccounts?.google,
          ].filter((email): email is string => Boolean(email));
          const orgs = await this.profiles.findOrganizationIdsByEmails(emails);

          await this.refreshWorkHistoryCache(
            wallet,
            workHistory?.cryptoNative || orgs.length > 0,
            workHistory?.workHistory ?? [],
            workHistory?.adjacentRepos ?? [],
          );

          await this.refreshUserRepoCache(
            wallet,
            (workHistory?.workHistory ?? []).map(x => {
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
          return workHistory;
        } else {
          return this.getCachedWorkHistory(wallet);
        }
      } else {
        return undefined;
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "profile.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`/profile/get-user-work-history: ${err.message}`);
    }
  }

  private async getUserCacheLock(wallet: string): Promise<number | null> {
    try {
      return await this.profiles.getCacheLock(wallet);
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

  private async refreshUserCacheLock(
    wallets: string[],
  ): Promise<number | null> {
    this.logger.log(`Refreshing cache lock for ${wallets.join(", ")}`);
    try {
      return this.profiles.setCacheLocks(
        wallets,
        addDays(
          now(),
          this.configService.get<number>("USER_CACHE_EXPIRATION_IN_DAYS"),
        ).getTime(),
      );
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

  private async refreshWorkHistoryCache(
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

    const result = await this.profiles
      .replaceWorkHistory(
        wallet,
        isCryptoNative,
        isCryptoAdjacent,
        workHistory.map(history => ({ ...history })),
        adjacentRepos.map(repository => ({ ...repository })),
      )
      .catch((err: Error) => {
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
        return false;
      });

    return {
      success: result,
      message: result
        ? "Persisted user work history successfully"
        : "Error caching work history",
    };
  }

  private async refreshUserRepoCache(
    wallet: string,
    dto: UserGithubOrganization[],
  ): Promise<ResponseWithNoData> {
    try {
      const updated = await this.profiles.replaceGithubRepositories(
        wallet,
        dto,
      );
      return {
        success: updated,
        message: updated
          ? "Persisted user repos successfully"
          : "User GitHub account not found",
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
      const updated = await this.profiles.blockOrganizationJobs(wallet, orgId);
      return {
        success: updated,
        message: updated
          ? "Org jobs blocked successfully"
          : "User or organization not found",
      };
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
      const updated = await this.profiles.setJobInteraction(
        wallet,
        shortUUID,
        "APPLIED_TO",
      );
      return {
        success: updated,
        message: updated
          ? "Logged application to job successfully"
          : "User or job not found",
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
      return await this.profiles.hasJobInteraction(
        wallet,
        shortUUID,
        "APPLIED_TO",
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
      const updated = await this.profiles.setJobInteraction(
        wallet,
        shortUUID,
        "BOOKMARKED",
      );
      return {
        success: updated,
        message: updated
          ? "Bookmarked job successfully"
          : "User or job not found",
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
      return await this.profiles.hasJobInteraction(
        wallet,
        shortUUID,
        "BOOKMARKED",
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
      const removed = await this.profiles.removeJobInteraction(
        wallet,
        shortUUID,
        "BOOKMARKED",
      );
      return {
        success: removed,
        message: removed
          ? "Unbookmarked job successfully"
          : "Bookmark not found",
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
  ): Promise<ResponseWithNoData> {
    try {
      const updated = await this.profiles.setJobInteraction(
        wallet,
        shortUUID,
        "VIEWED_DETAILS",
      );
      return {
        success: updated,
        message: updated
          ? "Logged job view successfully"
          : "User or job not found",
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
        `ProfileService::logViewDetailsInteraction ${err.message}`,
      );
      return { success: false, message: "Failed to log job view" };
    }
  }

  async logSearchInteraction(wallet: string, query: string): Promise<void> {
    try {
      await this.profiles.logSearch(wallet, query);
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

  async getUserWorkHistoryCache(wallet: string): Promise<UserWorkHistory[]> {
    try {
      return (await this.profiles.getWorkHistory(wallet))
        .map(history =>
          new UserWorkHistoryEntity(
            history as unknown as UserWorkHistory,
          ).getProperties(),
        )
        .filter(x => x.name);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet });
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProfileService::getUserWorkHistoryCache ${err.message}`,
      );
      return undefined;
    }
  }

  async getUserAdjacentReposCache(wallet: string): Promise<AdjacentRepo[]> {
    try {
      return (await this.profiles.getAdjacentRepos(
        wallet,
      )) as unknown as AdjacentRepo[];
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet });
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProfileService::getUserAdjacentReposCache ${err.message}`,
      );
      return [];
    }
  }
}
