import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { EmployeeStatus } from '@prisma/client';

export class UpdateStatusDto {
  @ApiProperty({ enum: EmployeeStatus, example: EmployeeStatus.ACTIVE })
  @IsEnum(EmployeeStatus)
  @IsNotEmpty()
  status!: EmployeeStatus;

  @ApiPropertyOptional({ example: 'Passed 3-month probation evaluation with excellent metrics' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}
