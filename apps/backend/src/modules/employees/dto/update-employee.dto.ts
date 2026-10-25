import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateEmployeeDto {
  @ApiPropertyOptional({ example: 'Alice' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Smith-Jones' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  lastName?: string;

  @ApiPropertyOptional({ example: '+1-555-0199' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: '123 Tech Way, Suite 400' })
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

  @ApiPropertyOptional({ example: 'cuid_department_id' })
  @IsString()
  @IsOptional()
  departmentId?: string | null;

  @ApiPropertyOptional({ example: 'cuid_designation_id' })
  @IsString()
  @IsOptional()
  designationId?: string | null;

  @ApiPropertyOptional({ example: 'cuid_team_id' })
  @IsString()
  @IsOptional()
  teamId?: string | null;

  @ApiPropertyOptional({ example: 'cuid_reporting_manager_id' })
  @IsString()
  @IsOptional()
  reportingManagerId?: string | null;

  @ApiPropertyOptional({ example: 92000 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  salary?: number;

  @ApiPropertyOptional({ example: 'https://res.cloudinary.com/zenhr/image/upload/avatar.png' })
  @IsString()
  @IsOptional()
  profilePictureUrl?: string;
}
