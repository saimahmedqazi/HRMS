import { Injectable } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

export interface PayslipPdfData {
  companyName: string;
  employeeName: string;
  employeeCode: string;
  departmentName?: string;
  designationName?: string;
  month: number;
  year: number;
  baseSalary: number;
  allowances: number;
  bonuses: number;
  deductions: number;
  taxAmount: number;
  netSalary: number;
}

@Injectable()
export class PdfService {
  /**
   * Generates a streaming PDF buffer for an employee payslip.
   */
  async generatePayslipPdf(data: PayslipPdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Company Branding Header
      doc.rect(40, 40, 515, 60).fill('#2563EB');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(18).text(data.companyName.toUpperCase(), 55, 52);
      doc.font('Helvetica').fontSize(11).text('OFFICIAL SALARY PAYSLIP', 55, 75);

      doc.fillColor('#000000');
      doc.moveDown(2);

      // Metadata Bar
      const startY = 120;
      doc.fontSize(10).text(`Statement Period: ${data.month.toString().padStart(2, '0')}/${data.year}`, 40, startY);
      doc.text(`Employee Code: ${data.employeeCode}`, 350, startY);
      doc.text(`Employee Name: ${data.employeeName}`, 40, startY + 16);
      doc.text(`Department: ${data.departmentName || 'General'}`, 350, startY + 16);

      // Divider
      doc.moveTo(40, startY + 40).lineTo(555, startY + 40).strokeColor('#E2E8F0').stroke();

      // Breakdown Table
      const tableY = startY + 55;
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1E293B').text('Earnings Breakdown', 40, tableY, { underline: true });
      doc.fontSize(10).font('Helvetica').fillColor('#475569');
      doc.text('Base Salary:', 40, tableY + 20);
      doc.text(`$${data.baseSalary.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 200, tableY + 20);

      doc.text('Allowances (Medical/Transport):', 40, tableY + 36);
      doc.text(`$${data.allowances.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 200, tableY + 36);

      if (data.bonuses > 0) {
        doc.text('Performance Bonuses:', 40, tableY + 52);
        doc.text(`$${data.bonuses.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 200, tableY + 52);
      }

      // Deductions column
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1E293B').text('Deductions & Withholding', 320, tableY, { underline: true });
      doc.fontSize(10).font('Helvetica').fillColor('#475569');
      doc.text('Pre-tax Deductions:', 320, tableY + 20);
      doc.text(`$${data.deductions.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 470, tableY + 20);

      doc.text('Income Tax:', 320, tableY + 36);
      doc.text(`$${data.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 470, tableY + 36);

      // Summary Net Box
      const summaryY = tableY + 95;
      doc.rect(40, summaryY, 515, 50).fill('#F8FAFC');
      doc.rect(40, summaryY, 515, 50).strokeColor('#CBD5E1').stroke();

      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(14).text('NET SALARY PAYABLE:', 55, summaryY + 18);
      doc.fillColor('#059669').fontSize(16).text(
        `$${data.netSalary.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
        360,
        summaryY + 16,
      );

      // Security Footer
      doc.fontSize(8).fillColor('#94A3B8').text(
        'ZenHR Multi-Tenant SaaS Platform • Strictly Confidential • This is a computer-generated payslip and requires no signature.',
        40,
        780,
        { align: 'center', width: 515 },
      );

      doc.end();
    });
  }

  /**
   * Generates a bulk consolidated PDF of multiple payslips.
   */
  async generateBulkPayslipsPdf(payslips: PayslipPdfData[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4', autoFirstPage: false });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      for (const data of payslips) {
        doc.addPage();

        // Company Branding Header
        doc.rect(40, 40, 515, 60).fill('#2563EB');
        doc.fillColor('#FFFFFF').fontSize(18).text(data.companyName.toUpperCase(), 55, 52);
        doc.fontSize(11).text('OFFICIAL SALARY PAYSLIP', 55, 75);

        doc.fillColor('#000000');
        const startY = 120;
        doc.fontSize(10).text(`Statement Period: ${data.month.toString().padStart(2, '0')}/${data.year}`, 40, startY);
        doc.text(`Employee Code: ${data.employeeCode}`, 350, startY);
        doc.text(`Employee Name: ${data.employeeName}`, 40, startY + 16);
        doc.text(`Department: ${data.departmentName || 'General'}`, 350, startY + 16);

        doc.moveTo(40, startY + 40).lineTo(555, startY + 40).strokeColor('#E2E8F0').stroke();

        const tableY = startY + 55;
        doc.fontSize(11).fillColor('#1E293B').text('Earnings Breakdown', 40, tableY, { underline: true });
        doc.fontSize(10).fillColor('#475569');
        doc.text('Base Salary:', 40, tableY + 20);
        doc.text(`$${data.baseSalary.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 200, tableY + 20);
        doc.text('Allowances:', 40, tableY + 36);
        doc.text(`$${data.allowances.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 200, tableY + 36);

        doc.fontSize(11).fillColor('#1E293B').text('Deductions & Taxes', 320, tableY, { underline: true });
        doc.fontSize(10).fillColor('#475569');
        doc.text('Deductions:', 320, tableY + 20);
        doc.text(`$${data.deductions.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 470, tableY + 20);
        doc.text('Income Tax:', 320, tableY + 36);
        doc.text(`$${data.taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 470, tableY + 36);

        const summaryY = tableY + 95;
        doc.rect(40, summaryY, 515, 50).fill('#F8FAFC');
        doc.rect(40, summaryY, 515, 50).strokeColor('#CBD5E1').stroke();
        doc.fillColor('#0F172A').fontSize(14).text('NET SALARY PAYABLE:', 55, summaryY + 18);
        doc.fillColor('#059669').fontSize(16).text(
          `$${data.netSalary.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
          360,
          summaryY + 16,
        );

        doc.fontSize(8).fillColor('#94A3B8').text(
          'ZenHR Multi-Tenant SaaS Platform • Strictly Confidential',
          40,
          780,
          { align: 'center', width: 515 },
        );
      }

      doc.end();
    });
  }
}
