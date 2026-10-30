import { EntityManager } from "@mikro-orm/postgresql";
export declare class HealthController {
    private readonly em;
    constructor(em: EntityManager);
    checkLiveness(): {
        status: string;
        timestamp: string;
    };
    checkReadiness(): Promise<{
        status: string;
        database: string;
        timestamp: string;
        error?: undefined;
    } | {
        status: string;
        database: string;
        timestamp: string;
        error: string;
    }>;
}
