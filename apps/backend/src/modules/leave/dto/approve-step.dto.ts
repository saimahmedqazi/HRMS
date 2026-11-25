import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveStepDto {
  @ApiProperty({ enum: ['APPROVE', 'PARTIAL', 'REJECT'], example: 'APPROVE' })
  @IsIn(['APPROVE', 'PARTIAL', 'REJECT'])
  decision!: 'APPROVE' | 'PARTIAL' | 'REJECT';

  @ApiPropertyOptional({ example: 'Handover complete. Approved.' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  approvedStart?: string;

  @IsOptional()
  @IsString()
  approvedEnd?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  partialReason?: string;
}
