import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDesignationDto {
  @ApiPropertyOptional({ example: 'Staff Software Engineer' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated designation description' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
