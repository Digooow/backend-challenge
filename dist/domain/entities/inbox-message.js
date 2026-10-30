"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InboxMessage = void 0;
class InboxMessage {
    constructor(messageId, consumerName, payloadHash, receivedAt, _processedAt) {
        this.messageId = messageId;
        this.consumerName = consumerName;
        this.payloadHash = payloadHash;
        this.receivedAt = receivedAt;
        this._processedAt = _processedAt;
    }
    static receive(props) {
        return new InboxMessage(props.messageId, props.consumerName, props.payloadHash, props.receivedAt ?? new Date());
    }
    static rehydrate(state) {
        return new InboxMessage(state.messageId, state.consumerName, state.payloadHash, state.receivedAt, state.processedAt);
    }
    get processedAt() {
        return this._processedAt;
    }
    isProcessed() {
        return this._processedAt !== undefined;
    }
    markProcessed(at = new Date()) {
        this._processedAt = at;
    }
}
exports.InboxMessage = InboxMessage;
//# sourceMappingURL=inbox-message.js.map