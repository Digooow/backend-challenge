import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module'; // Importado da mesma pasta
import { DomainExceptionFilter } from '../../presentation/filters/domain-exception.filter';
import { ValidationPipe } from '@nestjs/common';
import { JsonLoggerService } from '../observability/json-logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Ativa o logger estruturado em JSON globalmente
  app.useLogger(app.get(JsonLoggerService));

  app.useGlobalFilters(new DomainExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Jungle Gaming backend running on port ${port}`);
}

bootstrap();