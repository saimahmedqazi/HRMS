import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@acme.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'SecurePassword@123' })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiPropertyOptional({ example: '123456' })
  @IsString()
  @IsOptional()
  twoFactorCode?: string;

  @ApiPropertyOptional({ deprecated: true, description: 'Accepted for older clients and ignored' })
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional({ deprecated: true, description: 'Accepted for older clients and ignored' })
  @IsNumber()
  @IsOptional()
  longitude?: number;
}
