import 'multer';
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { randomUUID } from 'node:crypto';
import { Readable } from 'stream';

export interface UploadOptions {
  folder?: string;
  allowedMimeTypes?: string[];
  maxSizeBytes?: number;
  authenticated?: boolean;
}

export const DEFAULT_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
export const DEFAULT_DOCUMENT_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const rawExtensions: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly isConfigured: boolean;
  private readonly allowMockStorage: boolean;
  private readonly cloudName?: string;

  constructor(private readonly configService: ConfigService) {
    this.allowMockStorage = this.configService.get<string>('app.nodeEnv') !== 'production';
    const cloudName =
      this.configService.get<string>('app.cloudinary.cloudName') ||
      this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    this.cloudName = cloudName;
    const apiKey =
      this.configService.get<string>('app.cloudinary.apiKey') ||
      this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret =
      this.configService.get<string>('app.cloudinary.apiSecret') ||
      this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.isConfigured = true;
      this.logger.log('Cloudinary object storage configured successfully');
    } else {
      this.isConfigured = false;
      this.logger.warn(this.allowMockStorage
        ? 'Cloudinary credentials missing — using deterministic mock storage mode'
        : 'Cloudinary credentials missing — uploads are unavailable');
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    options: UploadOptions = {},
  ): Promise<{ url: string; publicId: string; size: number }> {
    if (!file) {
      throw new BadRequestException('No file provided for upload');
    }

    const allowedMimes = options.allowedMimeTypes || DEFAULT_DOCUMENT_MIMES;
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type '${file.mimetype}'. Allowed types: ${allowedMimes.join(', ')}`,
      );
    }

    const maxSize = options.maxSizeBytes || 10 * 1024 * 1024; // 10MB default
    if (file.size > maxSize) {
      throw new BadRequestException(
        `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of ${(maxSize / (1024 * 1024)).toFixed(0)} MB`,
      );
    }

    const folder = options.folder || 'zenhr-uploads';
    const resourceType = file.mimetype.startsWith('image/') ? 'image' : 'raw';
    const deliveryType = options.authenticated ? 'authenticated' : 'upload';
    const rawExtension = rawExtensions[file.mimetype];

    if (!this.isConfigured) {
      if (!this.allowMockStorage) throw new ServiceUnavailableException('File storage is not configured');
      // Deterministic mock URL for test/offline environments
      const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const publicId = `${folder}/${Date.now()}_${sanitizedName}`;
      const url = `https://res.cloudinary.com/zenhr/${resourceType}/${deliveryType}/v1/${publicId}`;

      return {
        url,
        publicId,
        size: file.size,
      };
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: resourceType,
          type: deliveryType,
          ...(rawExtension ? { public_id: `${randomUUID()}${rawExtension}` } : {}),
        },
        (error, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            this.logger.error('Cloudinary upload failure', error);
            return reject(new BadRequestException('Failed to upload file to object storage'));
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            size: result.bytes,
          });
        },
      );

      const stream = Readable.from(file.buffer);
      stream.pipe(uploadStream);
    });
  }

  getDownloadUrl(fileUrl: string, folders: string[]): string {
    if (!this.isConfigured) throw new ServiceUnavailableException('File storage is not configured');
    const asset = this.getStoredAsset(fileUrl, folders);

    return cloudinary.utils.private_download_url(asset.publicId, asset.format, {
      resource_type: asset.resourceType,
      type: asset.deliveryType,
      expires_at: Math.floor(Date.now() / 1000) + 60,
    });
  }

  async deleteFile(fileUrl: string, folders: string[]): Promise<void> {
    if (!this.isConfigured && this.allowMockStorage) return;
    if (!this.isConfigured) throw new ServiceUnavailableException('File storage is not configured');

    const asset = this.getStoredAsset(fileUrl, folders);
    try {
      const response = await cloudinary.uploader.destroy(asset.publicId, {
        resource_type: asset.resourceType,
        type: asset.deliveryType,
        invalidate: true,
      });
      if (response.result !== 'ok' && response.result !== 'not found') {
        throw new Error('Cloudinary did not confirm deletion');
      }
    } catch {
      throw new ServiceUnavailableException('Could not delete the stored file. Please try again.');
    }
  }

  private getStoredAsset(fileUrl: string, folders: string[]) {
    const invalidAsset = () => new NotFoundException('The stored file could not be located.');
    let url: URL;
    let parts: string[];
    try {
      url = new URL(fileUrl);
      parts = url.pathname.slice(1).split('/').map(decodeURIComponent);
    } catch {
      throw invalidAsset();
    }

    const [cloud, resourceType, deliveryType, ...path] = parts;
    if (url.origin !== 'https://res.cloudinary.com' || cloud !== this.cloudName ||
        (resourceType !== 'image' && resourceType !== 'raw') ||
        (deliveryType !== 'upload' && deliveryType !== 'private' && deliveryType !== 'authenticated') ||
        path.some((part) => !part || part === '.' || part === '..' || /[\\/\x00-\x1f]/.test(part))) {
      throw invalidAsset();
    }

    if (/^s--[a-zA-Z0-9_-]+--$/.test(path[0] ?? '')) path.shift();
    if (/^v\d+$/.test(path[0] ?? '')) path.shift();
    const filePath = path.join('/');
    if (!folders.some((folder) => filePath.startsWith(`${folder}/`) && filePath.length > folder.length + 1)) {
      throw invalidAsset();
    }
    const extensionIndex = filePath.lastIndexOf('.');
    if (resourceType === 'image' && extensionIndex <= filePath.lastIndexOf('/')) throw invalidAsset();

    return {
      publicId: resourceType === 'raw' ? filePath : filePath.slice(0, extensionIndex),
      format: resourceType === 'raw' ? '' : filePath.slice(extensionIndex + 1),
      resourceType,
      deliveryType,
    };
  }
}
