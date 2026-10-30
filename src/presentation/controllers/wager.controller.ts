import { Controller, Post, Body, Headers, HttpCode, HttpStatus, BadRequestException } from "@nestjs/common";
import { ProcessWagerTransactionUseCase } from "../../application/use-cases/process-wager-transaction.use-case";
import { ProcessWagerInputDto } from "../../application/dtos/process-wager.dto";

@Controller("wagering/transactions")
export class WagerController {
  constructor(private readonly processWagerUseCase: ProcessWagerTransactionUseCase) {}

  @Post()
  @HttpCode(HttpStatus.OK) // Conforme padrão de APIs idempotentes, retornar 200 OK
  async processTransaction(
    @Headers("Idempotency-Key") idempotencyKey: string,
    @Body() payload: Omit<ProcessWagerInputDto, "idempotencyKey">
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException("Header 'Idempotency-Key' is required");
    }

    const input: ProcessWagerInputDto = {
      ...payload,
      idempotencyKey, // Injetado a partir do header
    };

    const result = await this.processWagerUseCase.execute(input);
    return result;
  }
}