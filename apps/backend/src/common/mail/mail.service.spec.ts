import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { once } from 'node:events';
import { createServer, type Socket } from 'node:net';
import { MailService } from './mail.service';

describe('MailService', () => {
  it('sends password setup email over HTTPS when a Resend key is configured', async () => {
    const fetchEmail = jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ id: 'fixture-message' }));
    try {
      const mail = new MailService(new ConfigService({ app: {
        frontendUrl: 'https://zenhr.example.test',
        mail: { resendApiKey: 'fixture-key', fromAddress: 'hr@example.test', user: 'smtp-user', password: 'smtp-password' },
      } }));

      await expect(mail.sendPasswordResetEmail('employee@example.test', 'fixture-token')).resolves.toBe(true);
      expect(fetchEmail).toHaveBeenCalledTimes(1);
      const [url, request] = fetchEmail.mock.calls[0];
      expect(url).toBe('https://api.resend.com/emails');
      expect(request).toEqual(expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer fixture-key', 'Content-Type': 'application/json' },
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }));
      expect(JSON.parse(String(request?.body))).toEqual(expect.objectContaining({
        from: '"ZenHR" <hr@example.test>',
        to: ['employee@example.test'],
        html: expect.stringContaining('https://zenhr.example.test/reset-password?token=fixture-token'),
      }));
    } finally {
      fetchEmail.mockRestore();
    }
  });

  it('reports an HTTPS delivery rejection without falling back to SMTP', async () => {
    const fetchEmail = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 403 }));
    const logWarning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    try {
      const mail = new MailService(new ConfigService({ app: { mail: { resendApiKey: 'fixture-key' } } }));

      await expect(mail.sendMail({ to: 'employee@example.test', subject: 'Welcome', text: 'Welcome' })).resolves.toBe(false);
      expect(logWarning).toHaveBeenCalledWith('Email provider rejected delivery with HTTP 403.');
    } finally {
      fetchEmail.mockRestore();
      logWarning.mockRestore();
    }
  });

  it('cancels a stalled SMTP delivery so callers can handle email failure', async () => {
    const server = createServer();
    const logWarning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
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

      await expect(result).resolves.toBe(false);
      await disconnected;
      expect(logWarning).toHaveBeenCalledWith('SMTP delivery timed out after 8000 ms.');
    } finally {
      socket?.destroy();
      server.close();
      logWarning.mockRestore();
    }
  }, 12_000);

  it('returns even if the HTTPS provider never settles after cancellation', async () => {
    jest.useFakeTimers();
    const fetchEmail = jest.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {}));
    const logWarning = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    try {
      const mail = new MailService(new ConfigService({ app: { mail: { resendApiKey: 'fixture-key' } } }));
      const result = mail.sendMail({ to: 'employee@example.test', subject: 'Welcome', text: 'Welcome' });
      const signal = fetchEmail.mock.calls[0][1]?.signal;
      expect(signal?.aborted).toBe(false);

      await jest.advanceTimersByTimeAsync(8_000);

      await expect(result).resolves.toBe(false);
      expect(signal?.aborted).toBe(true);
      expect(logWarning).toHaveBeenCalledWith('Resend delivery timed out after 8000 ms.');
    } finally {
      jest.useRealTimers();
      fetchEmail.mockRestore();
      logWarning.mockRestore();
    }
  });
});
