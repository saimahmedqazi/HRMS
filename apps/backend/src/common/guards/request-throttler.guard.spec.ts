import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { requestContextStorage } from '../request-context/request-context.storage';
import { RequestThrottlerGuard, SessionProbe } from './request-throttler.guard';

describe('RequestThrottlerGuard', () => {
  const guard = new RequestThrottlerGuard([], { increment: jest.fn() }, new Reflector());
  const request = { ip: '192.0.2.20' };

  function tracker(userId: string, isPublic: boolean) {
    const handler = () => undefined;
    Reflect.defineMetadata(IS_PUBLIC_KEY, isPublic, handler);
    const context = new ExecutionContextHost([request], class FixtureController {}, handler);
    return requestContextStorage.run(
      { userId, companyId: 'company', role: 'EMPLOYEE', supportModeCompanyId: null, ipAddress: request.ip, userAgent: null },
      () => guard['getTracker'](request, context),
    );
  }

  it('gives authenticated users on a shared IP separate request limits', async () => {
    await expect(tracker('first-user', false)).resolves.toBe('user:first-user');
    await expect(tracker('second-user', false)).resolves.toBe('user:second-user');
  });

  it('keeps public endpoints limited by IP even with an existing session', async () => {
    await expect(tracker('first-user', true)).resolves.toBe(request.ip);
    await expect(tracker('second-user', true)).resolves.toBe(request.ip);
  });

  it('allows an anonymous session probe to reach the JWT guard even on a shared network', async () => {
    class FixtureController {
      @SessionProbe('access_token')
      probe() {}

      otherRoute() {}
    }
    const probeContext = new ExecutionContextHost([request], FixtureController, FixtureController.prototype.probe);
    const otherContext = new ExecutionContextHost([request], FixtureController, FixtureController.prototype.otherRoute);
    await expect(guard['shouldSkip'](probeContext)).resolves.toBe(true);
    await expect(guard['shouldSkip'](otherContext)).resolves.toBe(false);
    await requestContextStorage.run(
      { userId: 'first-user', companyId: 'company', role: 'EMPLOYEE', supportModeCompanyId: null, ipAddress: request.ip, userAgent: null },
      async () => {
        await expect(guard['shouldSkip'](probeContext)).resolves.toBe(false);
      },
    );
  });

  it('keeps refresh attempts that carry a refresh cookie limited by IP', async () => {
    class FixtureController {
      @SessionProbe('refresh_token')
      refresh() {}
    }
    const handler = FixtureController.prototype.refresh;
    const noSession = new ExecutionContextHost([request], FixtureController, handler);
    const hasCookie = new ExecutionContextHost(
      [{ ...request, cookies: { refresh_token: 'fixture-cookie' } }], FixtureController, handler,
    );
    await expect(guard['shouldSkip'](noSession)).resolves.toBe(true);
    await expect(guard['shouldSkip'](hasCookie)).resolves.toBe(false);
  });
});
