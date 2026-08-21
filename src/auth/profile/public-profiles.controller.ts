import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { ProfileRepository } from "src/postgres/profile.repository";

@Controller("profiles")
export class PublicProfilesController {
  constructor(private readonly profiles: ProfileRepository) {}

  @Get(":slug")
  async getProfile(
    @Param("slug") slug: string,
  ): Promise<Record<string, unknown>> {
    const profile = await this.profiles.getPublicEntityProfile(slug);
    if (!profile) {
      throw new NotFoundException({
        message: "Profile not found",
        action: { label: "Browse companies", href: "/organizations" },
      });
    }
    return profile;
  }
}
