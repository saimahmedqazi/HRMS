import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, Min, Max, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveExceptionDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'], example: 'APPROVE' })
  @IsIn(['APPROVE', 'REJECT'])
  @IsNotEmpty()
  action!: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional({ example: 'Verified emergency remote check-in with manager' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1440)
  workMinutes?: number;
}
