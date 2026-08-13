import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseInterceptors,
} from "@nestjs/common";
import { ApiOkResponse } from "@nestjs/swagger";
import { CacheHeaderInterceptor } from "src/shared/decorators/cache-interceptor.decorator";
import { PeopleIntelligenceService } from "./people-intelligence.service";
import {
  DeveloperReport,
  PeopleActivityMap,
  PeopleAtlasFrame,
  PeopleDirectoryPage,
  PeopleOverview,
  PersonProfile,
} from "./people-intelligence.types";

type PublicQuery = Record<string, string | number | boolean | undefined>;

@Controller("people")
@UseInterceptors(new CacheHeaderInterceptor({ mode: "revalidate-always" }))
export class PeopleIntelligenceController {
  constructor(private readonly people: PeopleIntelligenceService) {}

  @Get("overview")
  @ApiOkResponse({ description: "Ecosystem-wide People activity series" })
  overview(@Query() query: PublicQuery): Promise<PeopleOverview> {
    return this.people.overview(query);
  }

  @Get("developer-report")
  @ApiOkResponse({
    description: "Complete-period internal developer ecosystem report",
  })
  developerReport(): Promise<DeveloperReport> {
    return this.people.developerReport();
  }

  @Get("activity-map")
  @ApiOkResponse({ description: "Virtualized organization-by-time rows" })
  activityMap(@Query() query: PublicQuery): Promise<PeopleActivityMap> {
    return this.people.activityMap(query);
  }

  @Get("atlas")
  @ApiOkResponse({ description: "Navigable organization movement timeline" })
  atlas(@Query() query: PublicQuery): Promise<PeopleAtlasFrame> {
    return this.people.atlas(query);
  }

  @Get("directory")
  @ApiOkResponse({
    description: "Cursor-paginated canonical employee directory",
  })
  directory(@Query() query: PublicQuery): Promise<PeopleDirectoryPage> {
    return this.people.directory(query);
  }

  @Get(":login")
  @ApiOkResponse({ description: "Person organization and maintainer history" })
  async profile(@Param("login") login: string): Promise<PersonProfile> {
    const profile = await this.people.profile(login);
    if (!profile) throw new NotFoundException("Person not found");
    return profile;
  }
}
