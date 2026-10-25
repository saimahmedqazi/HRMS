import 'multer';
import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { Readable } from 'stream';

export interface UploadOptions {
  folder?: string;
  allowedMimeTypes?: string[];
  maxSizeBytes?: number;
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

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    const cloudName = this.configService.get<string>('app.cloudinary.cloudName');
    const apiKey = this.configService.get<string>('app.cloudinary.apiKey');
    const apiSecret = this.configService.get<string>('app.cloudinary.apiSecret');

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
      this.logger.warn('Cloudinary credentials missing — using deterministic mock storage mode');
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

    if (!this.isConfigured) {
      // Deterministic mock URL for test/offline environments
      const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const publicId = `${folder}/${Date.now()}_${sanitizedName}`;
      const url = `https://res.cloudinary.com/zenhr/raw/upload/v1/${publicId}`;

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
          resource_type: 'auto',
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
}
