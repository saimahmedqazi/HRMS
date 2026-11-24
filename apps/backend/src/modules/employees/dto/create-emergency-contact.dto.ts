import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEmergencyContactDto {
  @ApiProperty({ example: 'Robert Smith' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'Spouse' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  relationship!: string;

  @ApiProperty({ example: '+1-555-0144' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;

  @ApiPropertyOptional({ example: 'robert.smith@example.com' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() || undefined : value)
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '123 Tech Way, San Francisco' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @IsOptional()
  @MaxLength(255)
  address?: string;
}
