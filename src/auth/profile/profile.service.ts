import { Injectable } from "@nestjs/common";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import { UserProfileEntity } from "src/shared/entities";
import { Response, UserProfile } from "src/shared/interfaces";
import { UpdateUserProfileInput } from "./dto/update-profile.input";

@Injectable()
export class ProfileService {
  constructor(
    @InjectConnection()
    private neogma: Neogma,
  ) {}

  async getUserProfile(wallet: string): Promise<Response<UserProfile>> {
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
  }

  async updateUserProfile(
    wallet: string,
    dto: UpdateUserProfileInput,
  ): Promise<Response<UserProfile>> {
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
      message: "",
      data: new UserProfileEntity(
        result.records[0]?.get("profile"),
      ).getProperties(),
    };
  }
}
