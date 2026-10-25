import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateEmployeeDto {
  @ApiProperty({ example: 'Alice' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  firstName!: string;

  @ApiProperty({ example: 'Smith' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  lastName!: string;

  @ApiProperty({ example: 'alice.smith@acme.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ enum: UserRole, default: UserRole.EMPLOYEE })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole = UserRole.EMPLOYEE;

  @ApiPropertyOptional({ example: '+1-555-0199' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: '1995-04-12' })
  @IsString()
  @IsOptional()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'Female' })
  @IsString()
  @IsOptional()
  gender?: string;

  @ApiPropertyOptional({ example: 'US' })
  @IsString()
  @IsOptional()
  nationality?: string;

  @ApiPropertyOptional({ example: '123 Tech Way' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: 'San Francisco' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ example: 'USA' })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiPropertyOptional({ example: '2025-01-15' })
  @IsString()
  @IsOptional()
  hireDate?: string;

  @ApiPropertyOptional({ example: 'cuid_department_id' })
  @IsString()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ example: 'cuid_designation_id' })
  @IsString()
  @IsOptional()
  designationId?: string;

  @ApiPropertyOptional({ example: 'cuid_team_id' })
  @IsString()
  @IsOptional()
  teamId?: string;

  @ApiPropertyOptional({ example: 'cuid_reporting_manager_id' })
  @IsString()
  @IsOptional()
  reportingManagerId?: string;

  @ApiPropertyOptional({ example: 85000 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  salary?: number;
}
