import { EntityManager } from '@mikro-orm/postgresql';
export declare class HealthController {
    private readonly em;
    constructor(em: EntityManager);
    checkLiveness(): {
        status: string;
        timestamp: string;
    };
    checkReadiness(): Promise<{
        status: string;
        checks: {
            database: string;
            sqs: string;
        };
        timestamp: string;
    }>;
}
