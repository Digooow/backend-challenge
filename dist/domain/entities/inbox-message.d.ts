export interface ReceiveInboxProps {
    messageId: string;
    consumerName: string;
    payloadHash: string;
    receivedAt?: Date;
}
export interface InboxMessageState {
    messageId: string;
    consumerName: string;
    payloadHash: string;
    receivedAt: Date;
    processedAt?: Date;
}
export declare class InboxMessage {
    readonly messageId: string;
    readonly consumerName: string;
    readonly payloadHash: string;
    readonly receivedAt: Date;
    private _processedAt?;
    private constructor();
    static receive(props: ReceiveInboxProps): InboxMessage;
    static rehydrate(state: InboxMessageState): InboxMessage;
    get processedAt(): Date | undefined;
    isProcessed(): boolean;
    markProcessed(at?: Date): void;
}
