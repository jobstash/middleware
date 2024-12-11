import { forwardRef, Module } from "@nestjs/common";
import { SearchService } from "./search.service";
import { SearchController } from "./search.controller";
import { AuthModule } from "src/auth/auth.module";
import { Auth0Module } from "src/auth0/auth0.module";
import { ProfileModule } from "src/auth/profile/profile.module";

@Module({
  imports: [AuthModule, Auth0Module, forwardRef(() => ProfileModule)],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
