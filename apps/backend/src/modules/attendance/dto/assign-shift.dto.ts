import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class AssignShiftDto {
  @ApiPropertyOptional({ example: '2026-11-26', description: 'Optional effective date (YYYY-MM-DD) in company timezone; defaults to tomorrow' })
  @IsOptional()
  @IsString()
  effectiveDate?: string;

  @ApiPropertyOptional({ default: false, description: 'Confirm replacing an existing scheduled assignment on the exact same effective date' })
  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean;
}
