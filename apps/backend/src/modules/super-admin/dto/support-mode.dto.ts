import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class EnterSupportModeDto {
  @ApiProperty({
    example: 'Investigating payroll calculation discrepancy reported in ticket #1234',
    description: 'Mandatory reason for entering customer support impersonation mode',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Support mode reason must be at least 10 characters for audit compliance' })
  reason!: string;
}
