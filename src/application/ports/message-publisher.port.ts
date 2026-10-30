export interface PublishOptions {
  messageGroupId?: string;
  messageDeduplicationId?: string;
}

export interface MessagePublisherPort {
  publish(queueUrl: string, payload: Record<string, unknown>, options?: PublishOptions): Promise<void>;
}