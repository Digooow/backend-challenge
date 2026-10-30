"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalstackSqsClient = void 0;
const client_sqs_1 = require("@aws-sdk/client-sqs");
class LocalstackSqsClient {
    constructor() {
        this.sqs = new client_sqs_1.SQSClient({
            region: process.env.AWS_REGION ?? "us-east-1",
            endpoint: process.env.SQS_ENDPOINT ?? "http://localhost:4566",
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "test",
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
            },
        });
    }
    async publish(queueUrl, payload, options) {
        const command = new client_sqs_1.SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify(payload),
            MessageGroupId: options?.messageGroupId,
            MessageDeduplicationId: options?.messageDeduplicationId,
        });
        await this.sqs.send(command);
    }
}
exports.LocalstackSqsClient = LocalstackSqsClient;
//# sourceMappingURL=localstack-sqs.client.js.map