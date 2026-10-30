"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationEvent = void 0;
class IntegrationEvent {
    constructor(props) {
        this.eventId = props.eventId ?? crypto.randomUUID();
        this.aggregateId = props.aggregateId;
        this.correlationId = props.correlationId;
        this.causationId = props.causationId;
        this.occurredAt = props.occurredAt ?? new Date();
        this.data = Object.freeze(props.data);
    }
    toJSON() {
        return {
            eventId: this.eventId,
            eventType: this.eventType,
            aggregateId: this.aggregateId,
            correlationId: this.correlationId,
            causationId: this.causationId,
            occurredAt: this.occurredAt.toISOString(),
            version: this.version,
            data: this.data,
        };
    }
}
exports.IntegrationEvent = IntegrationEvent;
//# sourceMappingURL=integration-event.js.map