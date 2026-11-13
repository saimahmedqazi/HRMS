import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

function trimName({ value }: { value: unknown }) {
  return typeof value === 'string' ? value.trim() : value;
}

export class RegisterCompanyDto {
  @ApiProperty({ example: 'Acme Corporation' })
  @Transform(trimName)
  @IsString()
  @MinLength(2)
  companyName!: string;

  @ApiPropertyOptional({ example: 'contact@acme.com' })
  @IsEmail()
  @IsOptional()
  companyEmail?: string;

  @ApiProperty({ example: 'admin@acme.com' })
  @IsEmail()
  @IsNotEmpty()
  adminEmail!: string;

  @ApiProperty({ example: 'SecurePassword@123', minLength: 8 })
  @IsString()
  @MinLength(8)
  adminPassword!: string;

  @ApiProperty({ example: 'John' })
  @Transform(trimName)
  @IsString()
  @IsNotEmpty()
  adminFirstName!: string;

  @ApiProperty({ example: 'Doe' })
  @Transform(trimName)
  @IsString()
  @IsNotEmpty()
  adminLastName!: string;
}
