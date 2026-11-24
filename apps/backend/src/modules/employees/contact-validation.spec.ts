import { BadRequestException, ForbiddenException, ValidationPipe } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { EmployeesService } from './employees.service';
import { CreateEmergencyContactDto } from './dto/create-emergency-contact.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

const owner = { id: 'owner', email: 'owner@example.test', role: UserRole.EMPLOYEE, companyId: 'comp-1' };
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } });
const validate = <T>(body: object, metatype: new () => T): Promise<T> => pipe.transform(body, { type: 'body', metatype }) as Promise<T>;

describe('employee contact validation at the API boundary', () => {
  const prisma = { employee: { findFirst: jest.fn(), update: jest.fn() }, emergencyContact: { create: jest.fn() } };
  const service = new EmployeesService(prisma as any, {} as any, {} as any, {} as any);
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.employee.findFirst.mockResolvedValue({ id: 'emp-1', userId: 'owner', companyId: 'comp-1', country: 'Pakistan', phone: 'invalid legacy' });
  });
  it.each([{ city: '5789' }, { nationality: '4677' }, { phone: '+15550183286556689' }])('rejects invalid personal API input %p', async (body) => {
    const dto = await validate(body, UpdateEmployeeDto);
    await expect(service.updateEmployee('emp-1', dto, owner)).rejects.toThrow(BadRequestException);
    expect(prisma.employee.update).not.toHaveBeenCalled();
  });
  it('accepts international values and ignores unrelated legacy data', async () => {
    await service.updateEmployee('emp-1', await validate({ city: 'São Paulo', nationality: 'پاکستانی', phone: '03001234567' }, UpdateEmployeeDto), owner);
    await service.updateEmployee('emp-1', await validate({ address: 'شارع ١' }, UpdateEmployeeDto), owner);
    expect(prisma.employee.update).toHaveBeenCalledTimes(2);
  });
  it.each([
    { name: '  ', relationship: 'Parent', phone: '+923001234567' },
    { name: '56889', relationship: 'Parent', phone: '+923001234567' },
    { name: 'Maria', relationship: '35677', phone: '+923001234567' },
    { name: 'Maria', relationship: 'Parent', phone: '566888' },
  ])('rejects direct invalid contact input %p', async (body) => {
    await expect(validate(body, CreateEmergencyContactDto).then((dto) => service.addEmergencyContact('emp-1', dto, owner))).rejects.toThrow(BadRequestException);
    expect(prisma.emergencyContact.create).not.toHaveBeenCalled();
  });
  it('trims valid international contact information', async () => {
    const dto = await validate({ name: ' 李 小龍 ', relationship: ' والدہ ', phone: ' +923001234567 ' }, CreateEmergencyContactDto);
    await service.addEmergencyContact('emp-1', dto, owner);
    expect(prisma.emergencyContact.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ name: '李 小龍', relationship: 'والدہ', phone: '+923001234567' }) }));
  });
  it('preserves owner and tenant authorization', async () => {
    prisma.employee.findFirst.mockResolvedValueOnce({ id: 'emp-1', userId: 'other', companyId: 'comp-1' });
    await expect(service.addEmergencyContact('emp-1', { name: 'Maria', relationship: 'Parent', phone: '+923001234567' }, owner)).rejects.toThrow(ForbiddenException);
    expect(prisma.employee.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: 'comp-1' }) }));
  });
});
