import { appConfig } from './app.config';

describe('JWT signing configuration', () => {
  const accessSecret = Buffer.alloc(32, 1).toString('base64');
  const refreshSecret = Buffer.alloc(32, 2).toString('base64');

  beforeEach(() => {
    jest.replaceProperty(process, 'env', {
      NODE_ENV: 'production', JWT_ACCESS_SECRET: accessSecret, JWT_REFRESH_SECRET: refreshSecret,
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['JWT_ACCESS_SECRET', undefined],
    ['JWT_REFRESH_SECRET', ''],
    ['JWT_ACCESS_SECRET', 'short'],
    ['JWT_REFRESH_SECRET', ' '.repeat(32)],
    ['JWT_ACCESS_SECRET', 'your-super-secret-access-key-change-in-production-min-32-chars'],
    ['JWT_REFRESH_SECRET', 'your-super-secret-refresh-key-change-in-production-min-32-chars'],
  ] as const)('rejects invalid production %s without echoing its value', (name, value) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;

    expect(() => appConfig()).toThrow(new Error(
      `${name} must be set to a non-placeholder secret of at least 32 bytes in production.`,
    ));
  });

  it('requires different access and refresh secrets in production', () => {
    process.env.JWT_REFRESH_SECRET = accessSecret;

    expect(() => appConfig()).toThrow('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  });

  it('keeps both configured keys unchanged', () => {
    expect(appConfig().jwt).toMatchObject({ accessSecret, refreshSecret });
  });

  it('uses separate process-scoped keys for unconfigured development', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;

    const { jwt } = appConfig();
    expect(jwt).toEqual(appConfig().jwt);
    expect(Buffer.from(jwt.accessSecret, 'base64')).toHaveLength(32);
    expect(Buffer.from(jwt.refreshSecret, 'base64')).toHaveLength(32);
    expect(jwt.accessSecret).not.toBe(jwt.refreshSecret);
  });
});
