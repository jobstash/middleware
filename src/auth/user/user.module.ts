import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { UserService } from "../user/user.service";

@Module({
  imports: [ConfigModule],
  controllers: [],
  providers: [UserService],
})
export class UserModule {}
