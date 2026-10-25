import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CheckOutDto {
  @ApiPropertyOptional({ example: 'Leaving office for the day' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  notes?: string;
}
