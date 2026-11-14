import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { once } from 'node:events';
import { createServer, type Socket } from 'node:net';
import { MailService } from './mail.service';

describe('MailService', () => {
  it('cancels a stalled SMTP delivery so callers can handle email failure', async () => {
    const server = createServer();
    const controller = new AbortController();
    const timeout = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    let socket: Socket | undefined;

    try {
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing SMTP test port');

      const mail = new MailService(new ConfigService({
        app: { mail: { host: '127.0.0.1', port: address.port, user: 'test', password: 'test' } },
      }));
      const connected = new Promise<Socket>((resolve) => server.once('connection', resolve));
      const result = mail.sendMail({ to: 'employee@example.test', subject: 'Welcome', text: 'Welcome' });
      socket = await connected;
      const disconnected = once(socket, 'close');

      expect(timeout).toHaveBeenCalledWith(8_000);
      controller.abort();

      await expect(result).resolves.toBe(false);
      await disconnected;
      expect(logError).toHaveBeenCalled();
    } finally {
      controller.abort();
      socket?.destroy();
      server.close();
      timeout.mockRestore();
      logError.mockRestore();
    }
  });
});
