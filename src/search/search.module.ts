import { forwardRef, Module } from "@nestjs/common";
import { SearchService } from "./search.service";
import { SearchController } from "./search.controller";
import { SearchMarketController } from "./search-market.controller";
import { SearchV2Controller } from "./v2/search-v2.controller";
import { AuthModule } from "src/auth/auth.module";
import { Auth0Module } from "src/auth0/auth0.module";
import { ProfileModule } from "src/auth/profile/profile.module";

@Module({
  imports: [AuthModule, Auth0Module, forwardRef(() => ProfileModule)],
  controllers: [SearchController, SearchMarketController, SearchV2Controller],
  providers: [SearchService],
})
export class SearchModule {}
