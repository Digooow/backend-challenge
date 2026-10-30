import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';

@Controller('health')
export class HealthController {
  constructor(private readonly em: EntityManager) {}

  // Verifica apenas se o processo Node.js está a correr
  @Get('live')
  @HttpCode(HttpStatus.OK)
  checkLiveness() {
    return { status: 'UP', timestamp: new Date().toISOString() };
  }

  // Verifica se as dependências externas (PostgreSQL e SQS/LocalStack) estão alcançáveis
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async checkReadiness() {
    const checks = {
      database: 'DOWN',
      sqs: 'DOWN',
    };

    let isReady = true;

    // 1. Verificar PostgreSQL (ping simples)
    try {
      await this.em.getConnection().execute('SELECT 1');
      checks.database = 'UP';
    } catch (error) {
      isReady = false;
    }

    // 2. Verificar LocalStack/SQS
    try {
      const sqsEndpoint = process.env.SQS_ENDPOINT || 'http://localhost:4566';
      // Endpoint nativo de health do LocalStack
      const response = await fetch(`${sqsEndpoint}/_localstack/health`);
      if (response.ok) {
        checks.sqs = 'UP';
      } else {
        isReady = false;
      }
    } catch (error) {
      isReady = false;
    }

    if (!isReady) {
      throw new ServiceUnavailableException({
        status: 'DOWN',
        checks,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: 'UP',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}