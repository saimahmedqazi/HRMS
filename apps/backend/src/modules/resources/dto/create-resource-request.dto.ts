import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateResourceRequestDto {
  @ApiProperty({ example: 'Equipment (Ergonomic Chair, Dual 4K Monitors)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  resourceType!: string;

  @ApiProperty({ example: 'Requires dual display setup for frontend performance profiling and design review.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description!: string;

  @ApiPropertyOptional({ example: 'Current display is failing; essential for daily development output.' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  justification?: string;
}
