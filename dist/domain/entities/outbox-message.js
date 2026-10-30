"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboxMessage = void 0;
class OutboxMessage {
    constructor(id, aggregateId, eventType, payload, occurredAt, _attempts, _nextAttemptAt, _publishedAt) {
        this.id = id;
        this.aggregateId = aggregateId;
        this.eventType = eventType;
        this.payload = payload;
        this.occurredAt = occurredAt;
        this._attempts = _attempts;
        this._nextAttemptAt = _nextAttemptAt;
        this._publishedAt = _publishedAt;
    }
    static enqueue(event) {
        return new OutboxMessage(event.eventId, event.aggregateId, event.eventType, event.toJSON(), event.occurredAt, 0);
    }
    static rehydrate(state) {
        return new OutboxMessage(state.id, state.aggregateId, state.eventType, state.payload, state.occurredAt, state.attempts, state.nextAttemptAt, state.publishedAt);
    }
    get attempts() {
        return this._attempts;
    }
    get nextAttemptAt() {
        return this._nextAttemptAt;
    }
    get publishedAt() {
        return this._publishedAt;
    }
    isPending() {
        return this._publishedAt === undefined;
    }
    isDue(now = new Date()) {
        if (!this.isPending())
            return false;
        if (!this._nextAttemptAt)
            return true;
        return this._nextAttemptAt <= now;
    }
    markPublished(at = new Date()) {
        this._publishedAt = at;
    }
    scheduleRetry(now = new Date()) {
        this._attempts += 1;
        const backoffSeconds = Math.min(Math.pow(2, this._attempts), 300);
        this._nextAttemptAt = new Date(now.getTime() + backoffSeconds * 1000);
    }
}
exports.OutboxMessage = OutboxMessage;
//# sourceMappingURL=outbox-message.js.map