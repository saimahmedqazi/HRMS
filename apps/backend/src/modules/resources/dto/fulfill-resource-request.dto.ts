import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class FulfillResourceRequestDto {
  @ApiPropertyOptional({ example: 'Asset Tag #Zen-HW-9921 provisioned and delivered.' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
