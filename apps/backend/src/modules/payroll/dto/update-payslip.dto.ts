import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

function originalValue({ obj, key }: TransformFnParams): unknown {
  return obj[key];
}

export class UpdatePayslipDto {
  @ApiPropertyOptional({ example: 5500, description: 'Optional override of base salary for this payslip' })
  @Transform(originalValue, { toClassOnly: true })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999.99)
  @IsOptional()
  baseSalary?: number;

  @ApiPropertyOptional({ example: 750, description: 'One-off bonus amount for this pay period' })
  @Transform(originalValue, { toClassOnly: true })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999.99)
  @IsOptional()
  bonuses?: number;

  @ApiPropertyOptional({ example: 150, description: 'One-off post-tax deduction adjustment for this pay period' })
  @Transform(originalValue, { toClassOnly: true })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999_999.99)
  @IsOptional()
  adjustmentDeduction?: number;

  @ApiPropertyOptional({ example: 'Q4 spot bonus and travel advance recovery', nullable: true })
  @Transform(({ obj, key }) => {
    const raw = obj[key];
    return raw === '' ? null : raw;
  })
  @IsString()
  @MaxLength(300)
  @IsOptional()
  adjustmentNote?: string | null;
}
