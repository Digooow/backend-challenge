export interface UnitOfWorkPort {
  transaction<T>(work: (txManager: unknown) => Promise<T>): Promise<T>;
}