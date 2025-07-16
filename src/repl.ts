import { repl } from "@nestjs/core";
import { AppModule } from "./app.module";
import * as dotenv from "dotenv";

dotenv.config();

async function bootstrap(): Promise<void> {
  await repl(AppModule);
}
bootstrap();
