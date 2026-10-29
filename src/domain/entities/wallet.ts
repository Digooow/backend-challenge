import { DomainException } from "../exceptions/domain.exception";
import { Money } from "../value-objects/money";
import { LedgerDirection, WalletLedgerEntry } from "./wallet-ledger-entry";

export interface OpenWalletProps {
  id: string;
  playerId: string;
  initialBalance: Money;
  createdAt?: Date;
}

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balance: Money;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletOperationResult {
  ledgerEntry: WalletLedgerEntry;
}

export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    private _balance: Money,
    private _version: number,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static open(props: OpenWalletProps): { wallet: Wallet; openingLedgerEntry?: WalletLedgerEntry } {
    const now = props.createdAt ?? new Date();
    const currency = props.initialBalance.currency;

    if (props.initialBalance.isNegative()) {
      throw new DomainException("Saldo inicial da carteira não pode ser negativo.");
    }

    const wallet = new Wallet(
      props.id,
      props.playerId,
      currency,
      props.initialBalance,
      1, // version inicial
      now,
      now,
    );

    let openingLedgerEntry: WalletLedgerEntry | undefined;

    // Se o saldo inicial for maior que zero, gera a transação de abertura
    if (props.initialBalance.isPositive()) {
      const zeroBalance = Money.zero(currency);
      openingLedgerEntry = WalletLedgerEntry.create({
        id: crypto.randomUUID(),
        walletId: wallet.id,
        transactionId: crypto.randomUUID(),
        direction: LedgerDirection.Credit,
        money: props.initialBalance,
        balanceBefore: zeroBalance,
        balanceAfter: props.initialBalance,
        createdAt: now,
      });
    }

    return { wallet, openingLedgerEntry };
  }

  static rehydrate(state: WalletState): Wallet {
    return new Wallet(
      state.id,
      state.playerId,
      state.currency,
      state.balance,
      state.version,
      state.createdAt,
      state.updatedAt,
    );
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  debit(amount: Money, transactionId: string, ledgerEntryId?: string): WalletOperationResult {
    this.assertSameCurrency(amount);

    if (amount.isNegative() || amount.isZero()) {
      throw new DomainException("O valor do débito deve ser estritamente positivo.");
    }

    if (this._balance.isLessThan(amount)) {
      throw new DomainException("Saldo insuficiente para realizar a operação.");
    }

    const balanceBefore = this._balance;
    const balanceAfter = this._balance.subtract(amount);

    this._balance = balanceAfter;
    this._version += 1;
    this._updatedAt = new Date();

    const ledgerEntry = WalletLedgerEntry.create({
      id: ledgerEntryId ?? crypto.randomUUID(),
      walletId: this.id,
      transactionId,
      direction: LedgerDirection.Debit,
      money: amount,
      balanceBefore,
      balanceAfter,
      createdAt: this._updatedAt,
    });

    return { ledgerEntry };
  }

  credit(amount: Money, transactionId: string, ledgerEntryId?: string): WalletOperationResult {
    this.assertSameCurrency(amount);

    if (amount.isNegative() || amount.isZero()) {
      throw new DomainException("O valor do crédito deve ser estritamente positivo.");
    }

    const balanceBefore = this._balance;
    const balanceAfter = this._balance.add(amount);

    this._balance = balanceAfter;
    this._version += 1;
    this._updatedAt = new Date();

    const ledgerEntry = WalletLedgerEntry.create({
      id: ledgerEntryId ?? crypto.randomUUID(),
      walletId: this.id,
      transactionId,
      direction: LedgerDirection.Credit,
      money: amount,
      balanceBefore,
      balanceAfter,
      createdAt: this._updatedAt,
    });

    return { ledgerEntry };
  }

  private assertSameCurrency(money: Money): void {
    if (this.currency !== money.currency) {
      throw new DomainException(`Operação rejeitada: moeda ${money.currency} incompatível com a carteira ${this.currency}.`);
    }
  }
}