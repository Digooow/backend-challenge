import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';
export declare class ProviderAuthGuard implements CanActivate {
    private readonly logger;
    canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean>;
}
