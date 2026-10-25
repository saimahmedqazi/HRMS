import 'multer';
import { Test, TestingModule } from '@nestjs/testing';
import { StorageService, DEFAULT_IMAGE_MIMES } from './storage.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';

describe('StorageService', () => {
  let service: StorageService;

  const mockConfigService = {
    get: jest.fn(() => null), // Mock missing credentials -> deterministic mock mode
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  const createMockFile = (
    originalname = 'document.pdf',
    mimetype = 'application/pdf',
    size = 1024,
  ): Express.Multer.File => ({
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype,
    size,
    buffer: Buffer.from('mock file content'),
    stream: null as any,
    destination: '',
    filename: originalname,
    path: '',
  });

  it('should throw BadRequestException if no file is provided', async () => {
    await expect(service.uploadFile(null as any)).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException if file mime type is not allowed', async () => {
    const file = createMockFile('malicious.exe', 'application/x-msdownload');
    await expect(
      service.uploadFile(file, { allowedMimeTypes: DEFAULT_IMAGE_MIMES }),
    ).rejects.toThrow(/Invalid file type/);
  });

  it('should throw BadRequestException if file size exceeds maximum limit', async () => {
    const file = createMockFile('large.png', 'image/png', 15 * 1024 * 1024);
    await expect(
      service.uploadFile(file, { maxSizeBytes: 5 * 1024 * 1024 }),
    ).rejects.toThrow(/exceeds maximum allowed limit/);
  });

  it('should return secure HTTPS URL in mock mode when credentials are absent', async () => {
    const file = createMockFile('profile.png', 'image/png', 2048);
    const result = await service.uploadFile(file, { folder: 'avatars' });

    expect(result.url).toMatch(/^https:\/\/res\.cloudinary\.com/);
    expect(result.publicId).toContain('avatars/');
    expect(result.size).toBe(2048);
  });
});
