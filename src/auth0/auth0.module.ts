import { Module } from "@nestjs/common";
import { Auth0Service } from "./auth0.service";
import { CacheModule } from "@nestjs/cache-manager";

@Module({
  imports: [CacheModule.register()],
  providers: [Auth0Service],
  exports: [Auth0Service],
})
export class Auth0Module {}
