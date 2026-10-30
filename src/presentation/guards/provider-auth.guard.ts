import { CanActivate, ExecutionContext, Injectable, Logger } from "@nestjs/common";
import { Observable } from "rxjs";

/**
 * Ponto de extensão de autenticação (Seção 2 do README).
 * Em produção, valida tokens OIDC/JWT emitidos por um Identity Provider externo (Keycloak / Zitadel).
 */
@Injectable()
export class ProviderAuthGuard implements CanActivate {
  private readonly logger = new Logger(ProviderAuthGuard.name);

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const providerId = request.headers["x-provider-id"] || request.body?.providerId || "provider-default";
    request.user = { providerId };
    return true;
  }
}

