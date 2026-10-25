import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

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
}

export class CreatePayrollStructureDto {
  @ApiProperty({ example: 'Standard Engineering Package' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 60000 })
  @IsNumber()
  @Min(0)
  baseSalary!: number;

  @ApiProperty({ type: [SalaryComponentDto] })
  @IsArray()
  components!: SalaryComponentDto[];

  @ApiPropertyOptional({ example: { brackets: [{ min: 0, max: 30000, rate: 0 }, { min: 30000, max: 100000, rate: 0.1 }, { min: 100000, max: null, rate: 0.2 }] } })
  @IsOptional()
  taxRules?: any;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
