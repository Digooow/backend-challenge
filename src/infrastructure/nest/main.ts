import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from '../../presentation/filters/domain-exception.filter';
import { ValidationPipe } from '@nestjs/common';
import { JsonLoggerService } from '../observability/json-logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const logger = app.get(JsonLoggerService);
  app.useLogger(logger);

  // Habilita hooks de encerramento gracioso (SIGTERM / SIGINT) para o consumidor SQS e conexões de banco
  app.enableShutdownHooks();

  app.useGlobalFilters(new DomainExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`Jungle Gaming backend running on port ${port}`, 'Bootstrap');
}

bootstrap();
