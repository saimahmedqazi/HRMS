import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CheckInDto {
  @ApiProperty({ example: false, description: 'True if checking in remotely from home' })
  @IsBoolean()
  isRemote!: boolean;

  @ApiPropertyOptional({ example: 37.7749 })
  @IsNumber()
  @IsOptional()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: -122.4194 })
  @IsNumber()
  @IsOptional()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({ example: 'Arrived at office on time' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  notes?: string;
}
