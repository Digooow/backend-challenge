import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Response } from "express";
import { DomainException } from "../../domain/exceptions/domain.exception";

const TRANSIENT_PG_CODES = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "55P03", // lock_not_available
  "53300", // too_many_connections
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  "08000", // connection_exception
  "08003", // connection_does_not_exist
  "08006", // connection_failure
]);

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      return response.status(exception.getStatus()).json(exception.getResponse());
    }

    if (exception instanceof DomainException) {
      this.logger.warn({
        message: `Domain Exception: ${exception.message}`,
        category: exception.category,
        code: exception.code,
      });

      let status = HttpStatus.UNPROCESSABLE_ENTITY;
      switch (exception.category) {
        case "VALIDATION":
          status = HttpStatus.BAD_REQUEST;
          break;
        case "NOT_FOUND":
          status = HttpStatus.NOT_FOUND;
          break;
        case "CONFLICT":
          status = HttpStatus.CONFLICT;
          break;
        case "TRANSIENT_INFRA":
          status = HttpStatus.SERVICE_UNAVAILABLE;
          response.setHeader("Retry-After", "2");
          break;
        case "BUSINESS_RULE":
        default:
          status = HttpStatus.UNPROCESSABLE_ENTITY;
          break;
      }

      return response.status(status).json({
        statusCode: status,
        code: exception.code,
        message: exception.message,
        error: "DomainException",
      });
    }

    const anyErr = exception as Record<string, any>;
    const pgCode = String(anyErr?.code ?? "");

    // Sintaxe inválida de UUID no PostgreSQL (22P02) -> 400 Bad Request
    if (pgCode === "22P02") {
      return response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        code: "INVALID_IDENTIFIER_FORMAT",
        message: "Identificador em formato inválido (UUID esperado).",
      });
    }

    // Violação de unicidade concorrente no PostgreSQL (23505) -> 409 Conflict
    if (pgCode === "23505" || anyErr?.name === "UniqueConstraintViolationException") {
      return response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        code: "CONFLICT",
        message: "Conflito de unicidade ou idempotência detectado.",
      });
    }

    // Falha transitória de infraestrutura (banco indisponível, deadlock, lock timeout, ECONNREFUSED) -> 503
    const isTransientNetworkError =
      TRANSIENT_PG_CODES.has(pgCode) ||
      pgCode === "ECONNREFUSED" ||
      pgCode === "ETIMEDOUT" ||
      pgCode === "ECONNRESET" ||
      (typeof anyErr?.message === "string" &&
        (anyErr.message.includes("ECONNREFUSED") ||
          anyErr.message.includes("terminating connection") ||
          anyErr.message.includes("Connection terminated") ||
          anyErr.message.includes("timeout")));

    if (isTransientNetworkError) {
      this.logger.error(
        `Transient Infrastructure Exception: ${anyErr?.message ?? "Service unavailable"}`,
        exception instanceof Error ? exception : undefined,
      );
      response.setHeader("Retry-After", "2");
      return response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        code: "TRANSIENT_INFRASTRUCTURE_ERROR",
        message: "Falha transitória de infraestrutura. Tente novamente.",
      });
    }

    const message = exception instanceof Error ? exception.message : "Internal server error";
    this.logger.error(
      `Unhandled Exception: ${message}`,
      exception instanceof Error ? exception : undefined,
    );

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    });
  }
}
