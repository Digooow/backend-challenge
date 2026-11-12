import { DomainException } from "../exceptions/domain.exception";
import { InvalidTransactionStateException } from "../exceptions/invalid-transaction-state.exception";
import { WagerTransactionKind } from "../enums/wager-transaction-kind";
import { WagerTransactionStatus } from "../enums/wager-transaction-status";
import { FailureCode } from "../enums/failure-code";
import { LedgerDirection } from "../enums/ledger-direction";
import { Money } from "../value-objects/money";

export interface CreateWagerTransactionProps {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId?: string;
  createdAt?: Date;
}

export interface WagerTransactionState {
  id: string;
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  payloadHash: string;
  walletId: string;
  playerId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  money: Money;
  referenceExternalTransactionId?: string | null;
  createdAt: Date;
  status: WagerTransactionStatus;
  referenceTransactionId?: string | null;
  failureCode?: FailureCode | null;
  processedAt?: Date | null;
}

const ALLOWED_EXTERNAL_KINDS = new Set<string>([
  WagerTransactionKind.Bet,
  WagerTransactionKind.Win,
  WagerTransactionKind.Loss,
  WagerTransactionKind.Refund,
  WagerTransactionKind.Rollback,
]);

export class WagerTransaction {
  private constructor(
    public readonly id: string,
    public readonly providerId: string,
    public readonly externalTransactionId: string,
    public readonly idempotencyKey: string,
    public readonly payloadHash: string,
    public readonly walletId: string,
    public readonly playerId: string,
    public readonly roundId: string,
    public readonly gameId: string,
    public readonly kind: WagerTransactionKind,
    public readonly money: Money,
    public readonly referenceExternalTransactionId: string | undefined,
    public readonly createdAt: Date,
    private _status: WagerTransactionStatus,
    private _referenceTransactionId?: string,
    private _failureCode?: FailureCode,
    private _processedAt?: Date,
  ) {}

  static create(props: CreateWagerTransactionProps): WagerTransaction {
    if (props.kind === WagerTransactionKind.Opening) {
      throw DomainException.validation("Transação OPENING é de uso estritamente interno da carteira.");
    }

    if (!ALLOWED_EXTERNAL_KINDS.has(props.kind)) {
      throw DomainException.validation(`Tipo de operação inválido: ${String(props.kind)}.`);
    }

    if (props.money.isZero() || props.money.isNegative()) {
      throw DomainException.validation("O valor da transação deve ser estritamente positivo.");
    }

    const tx = new WagerTransaction(
      props.id,
      props.providerId,
      props.externalTransactionId,
      props.idempotencyKey,
      props.payloadHash,
      props.walletId,
      props.playerId,
      props.roundId,
      props.gameId,
      props.kind,
      props.money,
      props.referenceExternalTransactionId ?? undefined,
      props.createdAt ?? new Date(),
      WagerTransactionStatus.Pending,
    );

    if (tx.requiresReference() && !tx.referenceExternalTransactionId) {
      throw DomainException.validation(`A operação ${props.kind} exige referenceExternalTransactionId.`);
    }

    return tx;
  }

  /** Cria transação interna de abertura (OPENING) já no estado PROCESSED. */
  static createOpening(props: {
    id: string;
    walletId: string;
    playerId: string;
    money: Money;
    createdAt?: Date;
  }): WagerTransaction {
    const now = props.createdAt ?? new Date();
    return new WagerTransaction(
      props.id,
      "internal",
      `opening:${props.walletId}`,
      `internal:opening:${props.walletId}`,
      "opening",
      props.walletId,
      props.playerId,
      `opening:${props.walletId}`,
      "wallet-opening",
      WagerTransactionKind.Opening,
      props.money,
      undefined,
      now,
      WagerTransactionStatus.Processed,
      undefined,
      undefined,
      now,
    );
  }

  static rehydrate(state: WagerTransactionState): WagerTransaction {
    return new WagerTransaction(
      state.id,
      state.providerId,
      state.externalTransactionId,
      state.idempotencyKey,
      state.payloadHash,
      state.walletId,
      state.playerId,
      state.roundId,
      state.gameId,
      state.kind,
      state.money,
      state.referenceExternalTransactionId ?? undefined,
      state.createdAt,
      state.status,
      state.referenceTransactionId ?? undefined,
      state.failureCode ?? undefined,
      state.processedAt ?? undefined,
    );
  }

  get status(): WagerTransactionStatus {
    return this._status;
  }

  get referenceTransactionId(): string | undefined {
    return this._referenceTransactionId;
  }

  get failureCode(): FailureCode | undefined {
    return this._failureCode;
  }

  get processedAt(): Date | undefined {
    return this._processedAt;
  }

  // --- Transições de Estado
  markProcessed(referenceTransactionId: string | undefined, at: Date = new Date()): void {
    this.assertNotTerminal();
    this._status = WagerTransactionStatus.Processed;
    this._referenceTransactionId = referenceTransactionId;
    this._processedAt = at;
  }

  markPendingReference(): void {
    this.assertNotTerminal();
    this._status = WagerTransactionStatus.PendingReference;
  }

  reject(code: FailureCode): void {
    this.assertNotTerminal();
    this._status = WagerTransactionStatus.Rejected;
    this._failureCode = code;
    this._processedAt = new Date();
  }

  fail(code: FailureCode): void {
    this.assertNotTerminal();
    this._status = WagerTransactionStatus.Failed;
    this._failureCode = code;
    this._processedAt = new Date();
  }

  // --- Consultas de Domínio
  isTerminal(): boolean {
    return (
      this._status === WagerTransactionStatus.Processed ||
      this._status === WagerTransactionStatus.Rejected ||
      this._status === WagerTransactionStatus.Failed
    );
  }

  affectsBalance(): boolean {
    return this.kind !== WagerTransactionKind.Loss;
  }

  requiresReference(): boolean {
    return (
      this.kind === WagerTransactionKind.Refund ||
      this.kind === WagerTransactionKind.Rollback
    );
  }

  matchesPayload(payloadHash: string): boolean {
    return this.payloadHash === payloadHash;
  }

  isValidBetReferenceForWin(refBet: WagerTransaction | null | undefined): refBet is WagerTransaction {
    return Boolean(
      refBet &&
        refBet.kind === WagerTransactionKind.Bet &&
        refBet.status === WagerTransactionStatus.Processed &&
        refBet.playerId === this.playerId &&
        refBet.walletId === this.walletId &&
        refBet.roundId === this.roundId &&
        refBet.money.currency === this.money.currency,
    );
  }

  validateReversalReference(
    refTx: WagerTransaction,
    priorReversals: ReadonlyArray<WagerTransaction>,
  ): FailureCode | null {
    if (refTx.status !== WagerTransactionStatus.Processed) {
      return FailureCode.InvalidReferenceKind;
    }

    const matchesContext =
      refTx.playerId === this.playerId &&
      refTx.walletId === this.walletId &&
      refTx.money.currency === this.money.currency &&
      refTx.roundId === this.roundId;

    if (!matchesContext) {
      return FailureCode.InvalidReferenceKind;
    }

    if (this.kind === WagerTransactionKind.Refund && refTx.kind !== WagerTransactionKind.Bet) {
      return FailureCode.InvalidReferenceKind;
    }

    if (
      this.kind === WagerTransactionKind.Rollback &&
      refTx.kind !== WagerTransactionKind.Bet &&
      refTx.kind !== WagerTransactionKind.Win &&
      refTx.kind !== WagerTransactionKind.Refund
    ) {
      return FailureCode.InvalidReferenceKind;
    }

    if (!refTx.money.equals(this.money)) {
      return FailureCode.InvalidAmount;
    }

    if (priorReversals.some((r) => r.id !== this.id)) {
      return FailureCode.ReferenceAlreadyReverted;
    }

    return null;
  }

  ledgerDirectionFor(reference?: WagerTransaction): LedgerDirection {
    switch (this.kind) {
      case WagerTransactionKind.Opening:
      case WagerTransactionKind.Win:
      case WagerTransactionKind.Refund:
        return LedgerDirection.Credit;
      case WagerTransactionKind.Bet:
        return LedgerDirection.Debit;
      case WagerTransactionKind.Rollback:
        if (!reference) {
          throw DomainException.validation(
            "ROLLBACK exige a transação de referência para determinar a direção no ledger.",
            FailureCode.InvalidReferenceKind,
          );
        }
        return reference.kind === WagerTransactionKind.Bet
          ? LedgerDirection.Credit
          : LedgerDirection.Debit;
      default:
        throw DomainException.businessRule(
          `A operação ${this.kind} não gera lançamento no ledger.`,
        );
    }
  }

  private assertNotTerminal(): void {
    if (this.isTerminal()) {
      throw new InvalidTransactionStateException(
        `Transação ${this.id} está em estado terminal (${this._status}) e não pode alterar de estado.`
      );
    }
  }
}
