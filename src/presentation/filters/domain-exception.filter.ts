import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { DomainException } from '../../domain/exceptions/domain.exception';

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      return response.status(exception.getStatus()).json(exception.getResponse());
    }

    if (exception instanceof DomainException) {
      this.logger.warn(`Domain Exception: ${exception.message}`);
      
      let status = HttpStatus.UNPROCESSABLE_ENTITY;
      if (exception.message.includes('não encontrada')) {
        status = HttpStatus.NOT_FOUND;
      } else if (exception.message.includes('conflitante')) {
        status = HttpStatus.CONFLICT;
      } else if (exception.message.includes('inválid') || exception.message.includes('exige')) {
        status = HttpStatus.BAD_REQUEST;
      }

      return response.status(status).json({
        statusCode: status,
        message: exception.message,
        error: 'DomainException',
      });
    }

    const message = exception instanceof Error ? exception.message : 'Internal server error';
    this.logger.error(`Unhandled Exception: ${message}`, exception instanceof Error ? exception.stack : '');

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
