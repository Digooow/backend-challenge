import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class ProviderAuthGuard implements CanActivate {
  private readonly logger = new Logger(ProviderAuthGuard.name);

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Simulação da injeção do providerId (em produção viria do OIDC/Keycloak)
    const providerId = request.headers['x-provider-id'] || 'provider-default';
    
    request.user = { providerId };
    
    this.logger.debug(`AuthGuard No-op: Request allowed for provider [${providerId}]`);
    
    return true; 
  }
}