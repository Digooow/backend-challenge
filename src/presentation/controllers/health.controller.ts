// src/presentation/controllers/health.controller.ts
import { Controller, Get } from "@nestjs/common";
import { EntityManager } from "@mikro-orm/postgresql";

@Controller("health")
export class HealthController {
  constructor(private readonly em: EntityManager) {}

  @Get("live")
  checkLiveness() {
    return { status: "UP", timestamp: new Date().toISOString() };
  }

  @Get("ready")
  async checkReadiness() {
    try {
      await this.em.getConnection().execute('SELECT 1');
      return { status: "READY", database: "UP", timestamp: new Date().toISOString() };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { status: "DOWN", database: "DOWN", timestamp: new Date().toISOString(), error: errorMessage };
    }
  }
}