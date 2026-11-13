import { BadRequestException } from '@nestjs/common';
export type PayrollComponent = { name: string; type: 'ALLOWANCE' | 'DEDUCTION'; value: number; isPercentage: boolean };
export type PayrollTaxBracket = { min: number; max: number | null; rate: number };
export type PayrollTaxRules = { brackets: PayrollTaxBracket[] };

const MAX_PAYROLL_AMOUNT = 9_999_999_999.99;

export const DEFAULT_TAX_BRACKETS: PayrollTaxBracket[] = [
  { min: 0, max: 30000, rate: 0 },
  { min: 30000, max: 80000, rate: 0.1 },
  { min: 80000, max: null, rate: 0.2 },
];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function validatePayrollAmounts(amounts: number[]): void {
  if (!amounts.every((amount) => isNonNegativeNumber(amount) && amount <= MAX_PAYROLL_AMOUNT)) {
    throw new BadRequestException('A payroll amount is outside the supported range. Check the salary and package amounts.');
  }
}

export function readPayrollConfiguration(components: unknown, taxRules: unknown) {
  if (!Array.isArray(components)) throw new BadRequestException('Salary components must be an array.');

  const validComponents = components.map((value, index): PayrollComponent => {
    if (!isObject(value) || typeof value.name !== 'string' || !value.name.trim() ||
        (value.type !== 'ALLOWANCE' && value.type !== 'DEDUCTION') ||
        !isNonNegativeNumber(value.value) || typeof value.isPercentage !== 'boolean' ||
        (!value.isPercentage && value.value > MAX_PAYROLL_AMOUNT)) {
      throw new BadRequestException(`Salary component ${index + 1} needs a name, an allowance or deduction type, a valid nonnegative amount, and a percentage flag.`);
    }
    return { name: value.name, type: value.type, value: value.value, isPercentage: value.isPercentage };
  });

  if (taxRules == null || (isObject(taxRules) && Object.keys(taxRules).length === 0)) {
    return { components: validComponents, taxRules: undefined };
  }
  if (!isObject(taxRules) || !Array.isArray(taxRules.brackets)) {
    throw new BadRequestException('Tax rules must contain an array of brackets.');
  }

  const brackets = taxRules.brackets.map((value, index): PayrollTaxBracket => {
    if (!isObject(value) || !isNonNegativeNumber(value.min) ||
        (value.max !== null && (!isNonNegativeNumber(value.max) || value.max <= value.min)) ||
        !isNonNegativeNumber(value.rate) || value.rate > 1) {
      throw new BadRequestException(`Tax bracket ${index + 1} needs valid bounds and a rate between 0 and 1.`);
    }
    return { min: value.min, max: value.max, rate: value.rate };
  });

  const sorted = [...brackets].sort((a, b) => a.min - b.min);
  for (let index = 1; index < sorted.length; index++) {
    const previousMax = sorted[index - 1].max;
    if (previousMax === null || sorted[index].min < previousMax) {
      throw new BadRequestException('Tax brackets must not overlap. Only the highest bracket can have an open upper bound.');
    }
  }
  return { components: validComponents, taxRules: { brackets } };
}
