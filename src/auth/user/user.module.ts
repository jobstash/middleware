import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Neo4jModule } from "nest-neo4j/dist";
import { UserService } from "../user/user.service";
import { EncryptionService } from "./encryption/encryption.service";

@Module({
  imports: [Neo4jModule, ConfigModule],
  controllers: [],
  providers: [UserService, EncryptionService],
})
export class UserModule {}
