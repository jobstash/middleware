import { forwardRef, Module } from "@nestjs/common";
import { EcosystemsService } from "./ecosystems.service";
import { EcosystemsController } from "./ecosystems.controller";
import { UserModule } from "src/user/user.module";
import { SubscriptionsModule } from "src/subscriptions/subscriptions.module";
import { AuthModule } from "src/auth/auth.module";
import { TagsModule } from "src/tags/tags.module";

@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => UserModule),
    forwardRef(() => SubscriptionsModule),
    forwardRef(() => TagsModule),
  ],
  controllers: [EcosystemsController],
  providers: [EcosystemsService],
})
export class EcosystemsModule {}
