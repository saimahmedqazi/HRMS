import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
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
  phone?: string | null;

  @ApiPropertyOptional({ example: '1995-05-15' })
  @Transform(({ value }) => value === '' ? null : value)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}(?:$|T)/, { message: 'dateOfBirth must include a year, month and day' })
  @IsOptional()
  dateOfBirth?: string | null;

  @ApiPropertyOptional({ example: 'Female' })
  @IsString()
  @IsOptional()
  gender?: string | null;

  @ApiPropertyOptional({ example: 'US' })
  @IsString()
  @IsOptional()
  nationality?: string | null;

  @ApiPropertyOptional({ example: '123 Tech Way, Suite 400' })
  @IsString()
  @IsOptional()
  address?: string | null;

  @ApiPropertyOptional({ example: 'San Francisco' })
  @IsString()
  @IsOptional()
  city?: string | null;

  @ApiPropertyOptional({ example: 'USA' })
  @IsString()
  @IsOptional()
  country?: string | null;

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
