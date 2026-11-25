import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class RegularizationPolicyDto {
  @IsOptional()
  @IsBoolean()
  regularizationEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(366)
  regularizationLookback?: number;

  @IsOptional()
  @IsBoolean()
  regularizationExceptional?: boolean;

  @IsOptional()
  @IsBoolean()
  regularizationDocument?: boolean;
}
