import { ApiProperty } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

function originalValue({ obj, key }: TransformFnParams): unknown {
  return obj[key];
}

export class MarkPayrollPaidDto {
  @ApiProperty({ example: 10, description: 'Calendar month 1-12' })
  @Transform(originalValue, { toClassOnly: true })
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiProperty({ example: 2026, description: 'Calendar year' })
  @Transform(originalValue, { toClassOnly: true })
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;
}
