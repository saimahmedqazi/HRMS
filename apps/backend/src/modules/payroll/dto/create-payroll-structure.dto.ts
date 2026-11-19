import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import type { PayrollTaxRules } from '../payroll-configuration';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

function originalValue({ obj, key }: TransformFnParams): unknown {
  // Validate the JSON as sent, without coercing flags or nested component objects.
  return obj[key];
}

export class SalaryComponentDto {
  @ApiProperty({ example: 'Medical Allowance' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ enum: ['ALLOWANCE', 'DEDUCTION'], example: 'ALLOWANCE' })
  @IsString()
  @IsNotEmpty()
  type!: 'ALLOWANCE' | 'DEDUCTION';

  @ApiProperty({ example: 5000 })
  @IsNumber()
  @Min(0)
  value!: number;

  @ApiProperty({ example: false })
  @IsBoolean()
  isPercentage!: boolean;

  @ApiPropertyOptional({ example: true, description: 'Whether this deduction reduces taxable pay; defaults to true for backward compatibility' })
  @IsBoolean()
  @IsOptional()
  isPreTax?: boolean;
}

export class CreatePayrollStructureDto {
  @ApiProperty({ example: 'Standard Engineering Package' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 'USD', description: 'Three-letter ISO 4217 currency code' })
  @Matches(/^[A-Z]{3}$/)
  @IsOptional()
  currencyCode?: string = 'USD';

  @ApiProperty({ example: 60000 })
  @Transform(originalValue, { toClassOnly: true })
  @IsNumber()
  @Min(0)
  baseSalary!: number;

  @ApiProperty({ type: [SalaryComponentDto] })
  @Transform(originalValue, { toClassOnly: true })
  @IsArray()
  components!: SalaryComponentDto[];

  @ApiPropertyOptional({ example: { brackets: [{ min: 0, max: 30000, rate: 0 }, { min: 30000, max: 100000, rate: 0.1 }, { min: 100000, max: null, rate: 0.2 }] } })
  @Transform(originalValue, { toClassOnly: true })
  @IsOptional()
  taxRules?: PayrollTaxRules | null;

  @ApiPropertyOptional({ example: true })
  @Transform(originalValue, { toClassOnly: true })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
