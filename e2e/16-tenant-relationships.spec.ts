import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { openFixtureDatabase } from './fixture-database';

test('PostgreSQL keeps required workforce relationships within their company', async () => {
  const prisma = openFixtureDatabase();
  const fixtureId = randomUUID();
  const label = `Tenant integrity fixture ${fixtureId}`;
  const email = `tenant-fixture-${fixtureId}@example.test`;

  try {
    const owner = await prisma.employee.findFirstOrThrow({
      where: { user: { email: 'employee@acme.com' } },
      select: { id: true, companyId: true, departmentId: true },
    });
    if (!owner.departmentId) throw new Error('The seeded employee needs a department for this fixture');
    const otherCompany = await prisma.company.findUniqueOrThrow({
      where: { slug: 'globex-logistics' }, select: { id: true },
    });
    const otherDepartment = await prisma.department.create({
      data: { companyId: otherCompany.id, name: label }, select: { id: true },
    });
    const otherUser = await prisma.user.create({
      data: { companyId: otherCompany.id, email, passwordHash: 'fixture-only', role: 'EMPLOYEE', dataScope: 'SELF' },
    });
    const otherEmployee = await prisma.employee.create({
      data: {
        companyId: otherCompany.id, userId: otherUser.id, employeeCode: fixtureId,
        departmentId: otherDepartment.id, firstName: 'Tenant', lastName: 'Fixture', hireDate: new Date(),
      },
      select: { id: true },
    });
    const team = await prisma.team.create({
      data: { companyId: owner.companyId, departmentId: owner.departmentId, name: label },
    });
    const request = await prisma.resourceRequest.create({
      data: { companyId: owner.companyId, requestedById: owner.id, resourceType: label, description: label },
    });

    await expect(prisma.team.update({
      where: { id: team.id }, data: { departmentId: otherDepartment.id },
    })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.resourceRequest.update({
      where: { id: request.id }, data: { requestedById: otherEmployee.id },
    })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.user.update({
      where: { id: otherUser.id }, data: { companyId: owner.companyId },
    })).rejects.toMatchObject({ code: 'P2003' });

    const storedTeam = await prisma.team.findUniqueOrThrow({ where: { id: team.id } });
    const storedRequest = await prisma.resourceRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(storedTeam.departmentId).toBe(owner.departmentId);
    expect(storedRequest.requestedById).toBe(owner.id);
  } finally {
    try {
      await prisma.$transaction([
        prisma.resourceRequest.deleteMany({ where: { resourceType: label } }),
        prisma.team.deleteMany({ where: { name: label } }),
        prisma.employee.deleteMany({ where: { user: { email } } }),
        prisma.user.deleteMany({ where: { email } }),
        prisma.department.deleteMany({ where: { name: label } }),
      ]);
    } finally {
      await prisma.$disconnect();
    }
  }
});

test('optional assignments keep the company when a linked record is deleted', async () => {
  const prisma = openFixtureDatabase();
  const fixtureId = randomUUID();
  const label = `Optional relationships ${fixtureId}`;
  const emails = ['manager', 'employee'].map(role => `${role}-${fixtureId}@example.test`);

  try {
    const company = await prisma.company.findUniqueOrThrow({ where: { slug: 'acme-corp' } });
    const otherCompany = await prisma.company.findUniqueOrThrow({ where: { slug: 'globex-logistics' } });
    const [managerUser, employeeUser] = await Promise.all(emails.map(email => prisma.user.create({
      data: { companyId: company.id, email, passwordHash: 'fixture-only', role: 'EMPLOYEE', dataScope: 'SELF' },
    })));
    const manager = await prisma.employee.create({ data: {
      companyId: company.id, userId: managerUser.id, employeeCode: `${fixtureId}-manager`,
      firstName: 'Manager', lastName: 'Fixture', hireDate: new Date(),
    } });
    const department = await prisma.department.create({
      data: { companyId: company.id, managerId: manager.id, name: label },
    });
    const team = await prisma.team.create({
      data: { companyId: company.id, departmentId: department.id, leadId: manager.id, name: label },
    });
    const designation = await prisma.designation.create({ data: { companyId: company.id, name: label } });
    const employee = await prisma.employee.create({ data: {
      companyId: company.id, userId: employeeUser.id, employeeCode: fixtureId,
      firstName: 'Employee', lastName: 'Fixture', hireDate: new Date(),
      departmentId: department.id, designationId: designation.id, teamId: team.id, reportingManagerId: manager.id,
    } });
    const otherDepartment = await prisma.department.create({ data: { companyId: otherCompany.id, name: label } });
    const structure = await prisma.payrollStructure.create({
      data: { companyId: company.id, name: label, baseSalary: 100, components: [] },
    });
    const payslip = await prisma.payslip.create({ data: {
      companyId: company.id, employeeId: employee.id, payrollStructureId: structure.id,
      month: 1, year: 2026, baseSalary: 100, netSalary: 100,
    } });
    const [localShift, foreignShift] = await Promise.all([company.id, otherCompany.id].map(companyId => prisma.shift.create({
      data: { companyId, name: label, startTime: '09:00', endTime: '17:00', workDays: [1, 2, 3, 4, 5] },
    })));
    const assignment = await prisma.employeeShift.create({ data: {
      companyId: company.id, employeeId: employee.id, shiftId: localShift.id, effectiveFrom: new Date(),
    } });

    await expect(prisma.employee.update({
      where: { id: employee.id }, data: { departmentId: otherDepartment.id },
    })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.employeeShift.update({
      where: { id: assignment.id }, data: { shiftId: foreignShift.id },
    })).rejects.toMatchObject({ code: 'P2003' });

    await prisma.employee.delete({ where: { id: manager.id } });
    expect(await prisma.department.findUniqueOrThrow({ where: { id: department.id } }))
      .toMatchObject({ companyId: company.id, managerId: null });
    expect(await prisma.team.findUniqueOrThrow({ where: { id: team.id } }))
      .toMatchObject({ companyId: company.id, leadId: null });
    await prisma.team.delete({ where: { id: team.id } });
    await prisma.department.delete({ where: { id: department.id } });
    await prisma.designation.delete({ where: { id: designation.id } });
    await prisma.payrollStructure.delete({ where: { id: structure.id } });
    expect(await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } })).toMatchObject({
      companyId: company.id, departmentId: null, designationId: null, teamId: null, reportingManagerId: null,
    });
    expect(await prisma.payslip.findUniqueOrThrow({ where: { id: payslip.id } }))
      .toMatchObject({ companyId: company.id, payrollStructureId: null });
  } finally {
    try {
      await prisma.$transaction([
        prisma.employee.deleteMany({ where: { user: { email: { in: emails } } } }),
        prisma.user.deleteMany({ where: { email: { in: emails } } }),
        prisma.team.deleteMany({ where: { name: label } }),
        prisma.department.deleteMany({ where: { name: label } }),
        prisma.designation.deleteMany({ where: { name: label } }),
        prisma.payrollStructure.deleteMany({ where: { name: label } }),
        prisma.shift.deleteMany({ where: { name: label } }),
      ]);
    } finally {
      await prisma.$disconnect();
    }
  }
});
