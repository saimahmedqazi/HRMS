import { ArrayNotEmpty, ArrayUnique, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class ShiftPolicyDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveDate!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  workDays!: number[];

  @IsInt()
  @Min(0)
  @Max(1438)
  breakDuration!: number;

  @IsInt()
  @Min(1)
  @Max(1439)
  requiredMinutes!: number;

  @IsInt()
  @Min(1)
  @Max(1439)
  halfDayMinutes!: number;

  @IsInt()
  @Min(1)
  @Max(1439)
  fullDayMinutes!: number;

  @IsBoolean()
  overtimeEnabled!: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  overtimeCapMinutes?: number | null;
}
