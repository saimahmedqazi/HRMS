import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  timestamp: string;
  meta?: PaginationMeta;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data: unknown) => {
        // Pass binary stream responses (e.g., PDF payslips) through untouched
        if (data instanceof StreamableFile) {
          return data as unknown as ApiResponse<T>;
        }

        // If data is already in envelope format, pass through
        if (
          data &&
          typeof data === 'object' &&
          'success' in data &&
          'data' in data &&
          'message' in data
        ) {
          return data as ApiResponse<T>;
        }

        return {
          success: true,
          data: data as T,
          message: 'Request successful',
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
