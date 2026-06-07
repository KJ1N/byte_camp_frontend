import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import {
  getApiBootstrapFailureMessage,
  shouldLogApiBootstrapErrorDetails,
} from "./bootstrap-error";

export async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(config.get<number>("PORT") ?? 3001);
}

if (require.main === module) {
  bootstrap().catch((error) => {
    console.error(getApiBootstrapFailureMessage(error));
    if (shouldLogApiBootstrapErrorDetails(error)) {
      console.error(error);
    }
    process.exit(1);
  });
}
