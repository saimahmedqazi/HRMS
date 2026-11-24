import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsString, IsUUID, Max, Min } from 'class-validator';

export class SubmitLoginLocationDto {
  @ApiProperty({ example: 24.8607 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({ example: 67.0011 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiProperty({ example: 25 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(500_000)
  accuracy!: number;

  @ApiProperty({ example: '2026-11-24T15:30:00.000Z' })
  @IsDateString()
  capturedAt!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsString()
  @IsUUID()
  loginSessionId!: string;
}
