import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Query,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Response } from "express";
import { EntityManager } from "@mikro-orm/postgresql";
import { SQSClient, ListQueuesCommand } from "@aws-sdk/client-sqs";
import { MetricsService } from "../../infrastructure/observability/metrics.service";

@Controller()
export class HealthController {
  private readonly sqsClient: SQSClient;

  constructor(
    private readonly em: EntityManager,
    private readonly metricsService: MetricsService,
  ) {
    const endpoint = process.env.SQS_ENDPOINT || "http://localhost:4566";
    this.sqsClient = new SQSClient({
      region: process.env.AWS_REGION || "us-east-1",
      endpoint,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
      },
    });
  }

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

    // 2. Verificar SQS (compatível com LocalStack, MiniStack e AWS SQS via protocolo SQS nativo)
    try {
      await this.sqsClient.send(new ListQueuesCommand({ MaxResults: 1 }));
      checks.sqs = "UP";
    } catch {
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
  async getMetrics(
    @Res({ passthrough: true }) res: Response,
    @Query("format") format?: string,
    @Headers("accept") accept?: string,
  ) {
    await this.refreshOutboxLag();

    if (format === "prometheus" || (accept && accept.includes("text/plain"))) {
      res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
      return this.metricsService.toPrometheus();
    }

    return {
      ...this.metricsService.getMetrics(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get("metrics/prometheus")
  async getPrometheusMetrics(@Res({ passthrough: true }) res: Response) {
    await this.refreshOutboxLag();
    res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    return this.metricsService.toPrometheus();
  }

  private async refreshOutboxLag(): Promise<void> {
    try {
      const rows = await this.em
        .getConnection()
        .execute<Array<{ cnt: number | string }>>(
          `SELECT COUNT(*)::int AS cnt FROM "outbox_messages" WHERE "published_at" IS NULL`,
        );
      if (rows && rows[0]) {
        this.metricsService.setOutboxLag(Number(rows[0].cnt));
      }
    } catch {
      // Ignora caso a tabela ainda não exista ou o banco esteja temporariamente offline
    }
  }
}
