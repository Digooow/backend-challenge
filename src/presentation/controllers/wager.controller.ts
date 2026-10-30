import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  Res,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Inject,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";
import { ProcessWagerTransactionUseCase } from "../../application/use-cases/process-wager-transaction.use-case";
import { ProcessWagerInputDto } from "../../application/dtos/process-wager.dto";
import { WagerTransactionRepositoryPort } from "../../application/ports/wager-transaction.repository";
import { WagerTransactionStatus } from "../../domain/enums/wager-transaction-status";
import { DomainException } from "../../domain/exceptions/domain.exception";
import { ProviderAuthGuard } from "../guards/provider-auth.guard";

@Controller()
@UseGuards(ProviderAuthGuard)
export class WagerController {
  constructor(
    private readonly processWagerUseCase: ProcessWagerTransactionUseCase,
    @Inject('WagerTransactionRepositoryPort') private readonly wagerTxRepo: WagerTransactionRepositoryPort
  ) {}

  @Post("wagering/transactions")
  async processTransaction(
    @Res({ passthrough: true }) res: Response,
    @Headers("Idempotency-Key") idempotencyKey: string,
    @Body() payload: Omit<ProcessWagerInputDto, "idempotencyKey">
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException("Header 'Idempotency-Key' is required");
    }

    try {
      const input: ProcessWagerInputDto = {
        ...payload,
        idempotencyKey,
      };

      const result = await this.processWagerUseCase.execute(input);

      // Mapeamento semântico de status HTTP (conforme Seção 9 do README)
      switch (result.status) {
        case WagerTransactionStatus.Processed:
          res.status(HttpStatus.OK);
          break;
        case WagerTransactionStatus.PendingReference:
          res.status(HttpStatus.ACCEPTED);
          break;
        case WagerTransactionStatus.Rejected:
          res.status(HttpStatus.UNPROCESSABLE_ENTITY);
          break;
        case WagerTransactionStatus.Failed:
          res.status(HttpStatus.INTERNAL_SERVER_ERROR);
          break;
        default:
          res.status(HttpStatus.OK);
      }

      return result;
    } catch (error: any) {
      if (error instanceof DomainException && error.message.includes("Payload conflitante")) {
        throw new ConflictException("Payload conflitante para a mesma Idempotency Key.");
      }
      throw error;
    }
  }

  @Get("wagering/transactions/:transactionId")
  async getTransactionById(@Param("transactionId") transactionId: string) {
    const tx = await this.wagerTxRepo.findById(transactionId);
    if (!tx) {
      throw new NotFoundException(`Transaction ${transactionId} not found`);
    }

    return {
      id: tx.id,
      providerId: tx.providerId,
      externalTransactionId: tx.externalTransactionId,
      idempotencyKey: tx.idempotencyKey,
      walletId: tx.walletId,
      playerId: tx.playerId,
      roundId: tx.roundId,
      gameId: tx.gameId,
      kind: tx.kind,
      money: tx.money.toJSON(),
      status: tx.status,
      referenceExternalTransactionId: tx.referenceExternalTransactionId,
      referenceTransactionId: tx.referenceTransactionId,
      failureCode: tx.failureCode,
      createdAt: tx.createdAt.toISOString(),
      processedAt: tx.processedAt?.toISOString(),
    };
  }

  @Get("providers/:providerId/wagering/transactions/:externalTransactionId")
  async getTransactionByProviderAndExternalId(
    @Param("providerId") providerId: string,
    @Param("externalTransactionId") externalTransactionId: string
  ) {
    const tx = await this.wagerTxRepo.findByProviderAndExternalId(providerId, externalTransactionId);
    if (!tx) {
      throw new NotFoundException(`Transaction ${externalTransactionId} for provider ${providerId} not found`);
    }

    return {
      id: tx.id,
      providerId: tx.providerId,
      externalTransactionId: tx.externalTransactionId,
      idempotencyKey: tx.idempotencyKey,
      walletId: tx.walletId,
      playerId: tx.playerId,
      roundId: tx.roundId,
      gameId: tx.gameId,
      kind: tx.kind,
      money: tx.money.toJSON(),
      status: tx.status,
      referenceExternalTransactionId: tx.referenceExternalTransactionId,
      referenceTransactionId: tx.referenceTransactionId,
      failureCode: tx.failureCode,
      createdAt: tx.createdAt.toISOString(),
      processedAt: tx.processedAt?.toISOString(),
    };
  }
}
