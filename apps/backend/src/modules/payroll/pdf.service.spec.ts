import { PdfService } from './pdf.service';

describe('PdfService', () => {
  let service: PdfService;

  beforeEach(() => {
    service = new PdfService();
  });

  describe('generatePayslipPdf', () => {
    it('should generate a valid PDF buffer with %PDF magic header', async () => {
      const buffer = await service.generatePayslipPdf({
        companyName: 'Acme Corp',
        employeeName: 'Jane Doe',
        employeeCode: 'EMP-001',
        departmentName: 'Engineering',
        designationName: 'Senior Software Engineer',
        month: 10,
        year: 2026,
        baseSalary: 60000,
        allowances: 5000,
        bonuses: 1000,
        deductions: 1500,
        taxAmount: 5000,
        netSalary: 59500,
      });

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(100);
      // Valid PDF files start with %PDF
      const header = buffer.subarray(0, 4).toString();
      expect(header).toBe('%PDF');
    });
  });

  describe('generateBulkPayslipsPdf', () => {
    it('should generate a consolidated bulk PDF with multiple payslips', async () => {
      const buffer = await service.generateBulkPayslipsPdf([
        {
          companyName: 'Acme Corp',
          employeeName: 'Jane Doe',
          employeeCode: 'EMP-001',
          month: 10,
          year: 2026,
          baseSalary: 60000,
          allowances: 5000,
          bonuses: 0,
          deductions: 1000,
          taxAmount: 5000,
          netSalary: 59000,
        },
        {
          companyName: 'Acme Corp',
          employeeName: 'John Smith',
          employeeCode: 'EMP-002',
          month: 10,
          year: 2026,
          baseSalary: 50000,
          allowances: 3000,
          bonuses: 0,
          deductions: 1000,
          taxAmount: 4000,
          netSalary: 48000,
        },
      ]);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(500);
      expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    });

    it('supports non-USD currencies, performance bonuses, and adjustment notes in single and bulk PDFs', async () => {
      const sample = {
        companyName: 'Acme Europe',
        employeeName: 'Ada Lovelace',
        employeeCode: 'EMP-042',
        departmentName: 'Engineering',
        month: 11,
        year: 2026,
        currencyCode: 'EUR',
        baseSalary: 5000,
        allowances: 500,
        bonuses: 750,
        deductions: 200,
        taxAmount: 600,
        netSalary: 5450,
        adjustmentNote: 'Annual performance bonus',
      };

      const single = await service.generatePayslipPdf(sample);
      const bulk = await service.generateBulkPayslipsPdf([sample]);

      expect(single.subarray(0, 4).toString()).toBe('%PDF');
      expect(bulk.subarray(0, 4).toString()).toBe('%PDF');
      expect(bulk.length).toBeGreaterThan(400);
    });
  });
});
