import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateRemotePermissionDto {
  @ApiProperty({ example: '2026-11-01' })
  @IsString()
  @IsNotEmpty()
  startDate!: string;

  @ApiProperty({ example: '2026-11-05' })
  @IsString()
  @IsNotEmpty()
  endDate!: string;

  @ApiProperty({ example: 'Working remotely due to apartment plumbing repairs' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
