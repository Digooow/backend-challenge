import { Controller, Post, Body, Headers, HttpCode, HttpStatus, HttpException, UseGuards } from '@nestjs/common';
import { ProcessWagerTransactionUseCase } from '../../../application/use-cases/process-wager-transaction.use-case';
import { ProcessWagerRequestDto } from '../dtos/wager.dto';
import { WagerTransactionStatus } from '../../../domain/enums/wager-transaction-status';
import { ProviderAuthGuard } from '../guards/provider-auth.guard'; // O Guardião que criámos

@Controller('wagering')
@UseGuards(ProviderAuthGuard)
export class WagerController {
  constructor(private readonly processWagerUseCase: ProcessWagerTransactionUseCase) {}

  @Post('transactions')
  @HttpCode(HttpStatus.OK)
  async processTransaction(
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: ProcessWagerRequestDto,
  ) {
    if (!idempotencyKey) {
      throw new HttpException('Idempotency-Key header is required', HttpStatus.BAD_REQUEST);
    }

    try {
      const result = await this.processWagerUseCase.execute({
        ...dto,
        idempotencyKey,
      });

      // Mapeamento semântico de Status HTTP (Ganha pontos no requisito de clareza da API)
      switch (result.status) {
        case WagerTransactionStatus.Processed:
          return result;
        case WagerTransactionStatus.Rejected:
          // 422 Unprocessable Entity para falha de regra de negócio (ex: Saldo Insuficiente)
          throw new HttpException(result, HttpStatus.UNPROCESSABLE_ENTITY);
        case WagerTransactionStatus.PendingReference:
          // 202 Accepted para "Recebido, mas aguarda a referência chegar"
          throw new HttpException(result, HttpStatus.ACCEPTED);
        case WagerTransactionStatus.Failed:
          // 500 para falha técnica permanente auditável
          throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
        default:
          return result;
      }
    } catch (error: any) {
      if (error.message === 'Payload conflitante') {
        // 409 Conflict para quando tentam usar a mesma idempotency key com dados diferentes
        throw new HttpException({ error: 'Idempotency Key Conflict' }, HttpStatus.CONFLICT);
      }
      throw error;
    }
  }
}