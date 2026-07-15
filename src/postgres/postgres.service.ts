import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { DataSource, EntityManager, Repository } from "typeorm";
import {
  GraphNodeEntity,
  GraphRelationshipEntity,
  JobSearchDocumentEntity,
  OrganizationSearchDocumentEntity,
  ProjectSearchDocumentEntity,
} from "./entities";
import { PostgresOptions } from "./postgres.interface";

@Injectable()
export class PostgresService implements OnModuleInit, OnModuleDestroy {
  private readonly dataSource: DataSource;

  constructor(@Inject("POSTGRES_OPTIONS") options: PostgresOptions) {
    this.dataSource = new DataSource({
      type: "postgres",
      url: options.url,
      applicationName: options.applicationName,
      entities: [
        GraphNodeEntity,
        GraphRelationshipEntity,
        JobSearchDocumentEntity,
        OrganizationSearchDocumentEntity,
        ProjectSearchDocumentEntity,
      ],
      synchronize: false,
      logging: false,
      extra: {
        max: options.maxConnections,
        connectionTimeoutMillis: 15_000,
        statement_timeout: options.statementTimeoutMs,
        idle_in_transaction_session_timeout: options.statementTimeoutMs,
        options: "-c jit=off",
      },
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.dataSource.isInitialized) await this.dataSource.initialize();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.dataSource.isInitialized) await this.dataSource.destroy();
  }

  get nodes(): Repository<GraphNodeEntity> {
    return this.dataSource.getRepository(GraphNodeEntity);
  }

  get relationships(): Repository<GraphRelationshipEntity> {
    return this.dataSource.getRepository(GraphRelationshipEntity);
  }

  get jobSearchDocuments(): Repository<JobSearchDocumentEntity> {
    return this.dataSource.getRepository(JobSearchDocumentEntity);
  }

  get organizationSearchDocuments(): Repository<OrganizationSearchDocumentEntity> {
    return this.dataSource.getRepository(OrganizationSearchDocumentEntity);
  }

  get projectSearchDocuments(): Repository<ProjectSearchDocumentEntity> {
    return this.dataSource.getRepository(ProjectSearchDocumentEntity);
  }

  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters: unknown[] = [],
  ): Promise<T[]> {
    return this.dataSource.query(sql, parameters) as Promise<T[]>;
  }

  transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction("READ COMMITTED", work);
  }

  getDataSource(): DataSource {
    return this.dataSource;
  }
}
