import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';
import { CompanyStatus } from '@prisma/client';

export class UpdateCompanyStatusDto {
  @ApiProperty({ enum: CompanyStatus, example: CompanyStatus.SUSPENDED })
  @IsEnum(CompanyStatus)
  @IsNotEmpty()
  status!: CompanyStatus;
}
