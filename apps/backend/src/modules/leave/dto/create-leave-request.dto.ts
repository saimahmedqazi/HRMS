import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLeaveRequestDto {
  @ApiProperty({ example: 'cuid_leave_type_setting_id' })
  @IsString()
  @IsNotEmpty()
  leaveTypeSettingId!: string;

  @ApiProperty({ example: '2026-11-10' })
  @IsString()
  @IsNotEmpty()
  startDate!: string;

  @ApiProperty({ example: '2026-11-12' })
  @IsString()
  @IsNotEmpty()
  endDate!: string;

  @ApiPropertyOptional({ example: 'Doctor recommended rest for acute bronchitis' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}
