import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { parseTrustedProxyRanges } from './common/utils/request-ip';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 4000);
  const bindHost = configService.get<string>('API_BIND_HOST')?.trim();
  const frontendUrl = configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');
  const trustedProxyRanges = parseTrustedProxyRanges(configService.get<string>('TRUSTED_PROXY_CIDRS'));
  app.set('trust proxy', trustedProxyRanges.length ? trustedProxyRanges : false);

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Cookie parser
  app.use(cookieParser(configService.get<string>('COOKIE_SECRET')));

  // CORS — allow only frontend origin with credentials
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'X-CSRF-Token'],
  });

  // API prefix
  app.setGlobalPrefix(apiPrefix);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global response interceptor
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Swagger documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ZenHR HRMS API')
    .setDescription(
      'Multi-Tenant SaaS Human Resource Management System API\n\n' +
      'Authentication uses httpOnly cookies — use the /auth/login endpoint first.',
    )
    .setVersion('1.0')
    .addTag('auth', 'Authentication & session management')
    .addTag('companies', 'Company & tenant management')
    .addTag('employees', 'Employee management')
    .addTag('attendance', 'Attendance & work timer')
    .addTag('leave', 'Leave management')
    .addTag('payroll', 'Payroll & payslips')
    .addTag('super-admin', 'Platform-level Super Admin operations')
    .addCookieAuth('access_token')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      withCredentials: true,
    },
  });

  app.enableShutdownHooks();
  if (bindHost) await app.listen(port, bindHost);
  else await app.listen(port);
  logger.log(`🚀 ZenHR API running on http://localhost:${port}/${apiPrefix}`);
  logger.log(`📚 Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
