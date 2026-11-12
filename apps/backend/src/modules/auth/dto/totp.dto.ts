import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class VerifyTwoFactorLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  tempToken!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code!: string;
}

export class VerifyTotpDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{6}$/, { message: 'Enter the six-digit authenticator code.' })
  code!: string;
}

export class DisableTotpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  password!: string;
}
