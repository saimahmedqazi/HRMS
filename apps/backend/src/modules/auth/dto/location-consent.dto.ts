import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

export class LocationConsentDto {
  @ApiProperty({ example: false })
  @Transform(({ obj }) => obj.locationConsent)
  @IsBoolean()
  locationConsent!: boolean;
}
