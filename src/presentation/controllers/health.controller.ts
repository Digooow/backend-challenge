// src/presentation/controllers/health.controller.ts
import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";
import { MetricsService } from "../../infrastructure/observability/metrics.service";

@Controller()
export class HealthController {
  constructor(
    private readonly em: EntityManager,
    private readonly metricsService: MetricsService
  ) {}

  @Get("health/live")
  @HttpCode(HttpStatus.OK)
  checkLiveness() {
    return { status: "UP", timestamp: new Date().toISOString() };
  }

  @Get("health/ready")
  @HttpCode(HttpStatus.OK)
  async checkReadiness() {
    const checks = {
      database: "DOWN",
      sqs: "DOWN",
    };

    let isReady = true;

    // 1. Verificar PostgreSQL
    try {
      await this.em.getConnection().execute("SELECT 1");
      checks.database = "UP";
    } catch {
      isReady = false;
    }

    // 2. Verificar LocalStack SQS
    try {
      const sqsEndpoint = process.env.SQS_ENDPOINT || "http://localhost:4566";
      const response = await fetch(`${sqsEndpoint}/_localstack/health`);
      if (response.ok) {
        checks.sqs = "UP";
      } else {
        isReady = false;
      }
    } catch {
      isReady = false;
    }

    if (!isReady) {
      throw new ServiceUnavailableException({
        status: "DOWN",
        checks,
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: "UP",
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  @Get("metrics")
  getMetrics() {
    return {
      ...this.metricsService.getMetrics(),
      timestamp: new Date().toISOString(),
    };
  }
}
