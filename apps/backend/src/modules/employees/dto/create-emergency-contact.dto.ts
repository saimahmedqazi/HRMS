import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEmergencyContactDto {
  @ApiProperty({ example: 'Robert Smith' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'Spouse' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  relationship!: string;

  @ApiProperty({ example: '+1-555-0144' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phone!: string;

  @ApiPropertyOptional({ example: 'robert.smith@example.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '123 Tech Way, San Francisco' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  address?: string;
}
