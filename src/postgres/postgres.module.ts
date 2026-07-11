import { DynamicModule, Global, Module } from "@nestjs/common";
import { PostgresAsyncOptions } from "./postgres.interface";
import { PostgresService } from "./postgres.service";
import { SearchDocumentRepository } from "./search-document.repository";
import { GraphRepository } from "./graph.repository";
import { JobGraphRepository } from "./job-graph.repository";
import { EcosystemRepository } from "./ecosystem.repository";
import { TelemetryRepository } from "./telemetry.repository";
import { WhiteLabelBoardRepository } from "./white-label-board.repository";
import { DelegateAccessRepository } from "./delegate-access.repository";
import { TagRepository } from "./tag.repository";
import { SearchRepository } from "./search.repository";
import { UserRepository } from "./user.repository";
import { ProfileRepository } from "./profile.repository";
import { SubscriptionRepository } from "./subscription.repository";
import { GrantRepository } from "./grant.repository";

@Global()
@Module({})
export class PostgresModule {
  static forRootAsync(options: PostgresAsyncOptions): DynamicModule {
    return {
      module: PostgresModule,
      imports: options.imports,
      providers: [
        {
          provide: "POSTGRES_OPTIONS",
          useFactory: options.useFactory,
          inject: options.inject,
        },
        PostgresService,
        SearchDocumentRepository,
        GraphRepository,
        JobGraphRepository,
        EcosystemRepository,
        TelemetryRepository,
        WhiteLabelBoardRepository,
        DelegateAccessRepository,
        TagRepository,
        SearchRepository,
        UserRepository,
        ProfileRepository,
        SubscriptionRepository,
        GrantRepository,
      ],
      exports: [
        PostgresService,
        SearchDocumentRepository,
        GraphRepository,
        JobGraphRepository,
        EcosystemRepository,
        TelemetryRepository,
        WhiteLabelBoardRepository,
        DelegateAccessRepository,
        TagRepository,
        SearchRepository,
        UserRepository,
        ProfileRepository,
        SubscriptionRepository,
        GrantRepository,
      ],
    };
  }
}
