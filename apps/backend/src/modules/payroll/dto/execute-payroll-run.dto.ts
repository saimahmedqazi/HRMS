import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class ExecutePayrollRunDto {
  @ApiProperty({ example: 10, description: 'Calendar month 1-12' })
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiProperty({ example: 2026, description: 'Calendar year' })
  @IsInt()
  @Min(2020)
  @Max(2100)
  year!: number;
}
