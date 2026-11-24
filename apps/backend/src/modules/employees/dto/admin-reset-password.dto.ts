import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class AdminResetPasswordDto {
  @ApiProperty({ example: 'TempPass@2026', minLength: 8 })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  temporaryPassword!: string;
}
