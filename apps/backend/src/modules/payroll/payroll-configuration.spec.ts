import { BadRequestException } from '@nestjs/common';
import { readPayrollConfiguration, validatePayrollAmounts } from './payroll-configuration';

describe('payroll-configuration', () => {
  describe('validatePayrollAmounts', () => {
    it('accepts zero and amounts up to PostgreSQL Decimal(12,2) max', () => {
      expect(() => validatePayrollAmounts([0, 1234.56, 9_999_999_999.99])).not.toThrow();
    });

    it.each([
      ['negative', [-0.01]],
      ['NaN', [Number.NaN]],
      ['Infinity', [Number.POSITIVE_INFINITY]],
      ['overflow', [10_000_000_000]],
    ])('rejects %s amounts', (_label, values) => {
      expect(() => validatePayrollAmounts(values)).toThrow(BadRequestException);
    });
  });

  describe('readPayrollConfiguration', () => {
    it('normalizes fixed and percentage components with default pre-tax deductions', () => {
      const result = readPayrollConfiguration(
        [
          { name: 'Housing', type: 'ALLOWANCE', value: 500, isPercentage: false },
          { name: 'Pension', type: 'DEDUCTION', value: 5, isPercentage: true },
          { name: 'Loan', type: 'DEDUCTION', value: 200, isPercentage: false, isPreTax: false },
        ],
        {
          brackets: [
            { min: 5000, max: null, rate: 0.2 },
            { min: 0, max: 5000, rate: 0.1 },
          ],
        },
      );

      expect(result.components).toEqual([
        { name: 'Housing', type: 'ALLOWANCE', value: 500, isPercentage: false },
        { name: 'Pension', type: 'DEDUCTION', value: 5, isPercentage: true, isPreTax: true },
        { name: 'Loan', type: 'DEDUCTION', value: 200, isPercentage: false, isPreTax: false },
      ]);
      expect(result.taxRules).toEqual({
        brackets: [
          { min: 0, max: 5000, rate: 0.1 },
          { min: 5000, max: null, rate: 0.2 },
        ],
      });
    });

    it('handles null, empty object, and empty bracket array cleanly', () => {
      expect(readPayrollConfiguration([], null)).toEqual({ components: [], taxRules: undefined });
      expect(readPayrollConfiguration([], {})).toEqual({ components: [], taxRules: undefined });
      expect(readPayrollConfiguration([], { brackets: [] })).toEqual({
        components: [],
        taxRules: { brackets: [] },
      });
    });

    it('rejects non-array components and blank component names', () => {
      expect(() => readPayrollConfiguration('invalid', null)).toThrow(BadRequestException);
      expect(() =>
        readPayrollConfiguration([{ name: '   ', type: 'ALLOWANCE', value: 100, isPercentage: false }], null),
      ).toThrow(BadRequestException);
    });

    it('rejects inverted, overlapping, gapped, or closed-top tax brackets', () => {
      expect(() =>
        readPayrollConfiguration([], { brackets: [{ min: 500, max: 500, rate: 0.1 }] }),
      ).toThrow(BadRequestException);
      expect(() =>
        readPayrollConfiguration([], {
          brackets: [
            { min: 0, max: 1000, rate: 0.1 },
            { min: 900, max: null, rate: 0.2 },
          ],
        }),
      ).toThrow('must not overlap');
      expect(() =>
        readPayrollConfiguration([], {
          brackets: [
            { min: 0, max: 1000, rate: 0.1 },
            { min: 1500, max: null, rate: 0.2 },
          ],
        }),
      ).toThrow('must be contiguous');
      expect(() =>
        readPayrollConfiguration([], { brackets: [{ min: 0, max: 1000, rate: 0.1 }] }),
      ).toThrow('open upper bound');
    });
  });
});
