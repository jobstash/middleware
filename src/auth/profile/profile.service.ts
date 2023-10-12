import { Injectable } from "@nestjs/common";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import { UserProfileEntity } from "src/shared/entities";
import { Response, UserProfile } from "src/shared/interfaces";

@Injectable()
export class ProfileService {
  constructor(
    @InjectConnection()
    private neogma: Neogma,
  ) {}

  async getUserProfile(wallet: string): Promise<Response<UserProfile>> {
    const result = await this.neogma.queryRunner.run(
      `
        RETURN (user:User {wallet: $wallet})-[:HAS_PROFILE]->(profile:UserProfile) | profile {
          .*,
          username: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.login][0],
          avatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
          contact: [(user)-[:HAS_CONTACT_INFO]->(contact: UserContactInfo) | contact { .* }][0]
        }

      `,
      { wallet },
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
