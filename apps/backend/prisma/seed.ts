import {
  PrismaClient,
  UserRole,
  DataScope,
  SubscriptionTier,
  CompanyStatus,
  EmployeeStatus,
  LeaveType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const passwordHash = await bcrypt.hash('Password@123', 10);
  const superAdminPasswordHash = await bcrypt.hash('SuperAdmin@123', 10);

  // 1. Platform Super Admin (no company)
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@zenhr.com' },
    update: {},
    create: {
      email: 'superadmin@zenhr.com',
      passwordHash: superAdminPasswordHash,
      role: UserRole.SUPER_ADMIN,
      dataScope: DataScope.PLATFORM,
      isEmailVerified: true,
    },
  });
  console.log('✅ Seeded Super Admin:', superAdmin.email);

  // 2. Platform Operation Manager (no company)
  const opsManager = await prisma.user.upsert({
    where: { email: 'ops@zenhr.com' },
    update: {},
    create: {
      email: 'ops@zenhr.com',
      passwordHash,
      role: UserRole.OPERATION_MANAGER,
      dataScope: DataScope.PLATFORM,
      isEmailVerified: true,
    },
  });
  console.log('✅ Seeded Operation Manager:', opsManager.email);

  // 3. Demo Tenant 1: Acme Corp (PREMIUM)
  const acme = await prisma.company.upsert({
    where: { email: 'contact@acme.com' },
    update: {},
    create: {
      name: 'Acme Corporation',
      slug: 'acme-corp',
      email: 'contact@acme.com',
      status: CompanyStatus.ACTIVE,
      subscriptionTier: SubscriptionTier.PREMIUM,
    },
  });
  console.log('✅ Seeded Company 1:', acme.name);

  // Default shift for Acme
  await prisma.shift.create({
    data: {
      companyId: acme.id,
      name: 'Standard Day Shift',
      startTime: '09:00',
      endTime: '17:00',
      breakDuration: 60,
      workDays: [1, 2, 3, 4, 5],
      isDefault: true,
    },
  });

  // Default leave types for Acme
  await prisma.leaveTypeSetting.createMany({
    data: [
      { companyId: acme.id, leaveType: LeaveType.CASUAL, annualAllocation: 10, requiresReason: true, requiresMedicalCert: false },
      { companyId: acme.id, leaveType: LeaveType.SICK, annualAllocation: 12, requiresReason: false, requiresMedicalCert: true },
      { companyId: acme.id, leaveType: LeaveType.ANNUAL, annualAllocation: 14, requiresReason: true, requiresMedicalCert: false },
    ],
    skipDuplicates: true,
  });

  // Departments for Acme
  const engDept = await prisma.department.create({
    data: { companyId: acme.id, name: 'Engineering', description: 'Engineering & Development' },
  });
  const hrDept = await prisma.department.create({
    data: { companyId: acme.id, name: 'Human Resources', description: 'People & Operations' },
  });

  // Designations for Acme
  const ceoDesig = await prisma.designation.create({
    data: { companyId: acme.id, name: 'Chief Executive Officer' },
  });
  const hrDesig = await prisma.designation.create({
    data: { companyId: acme.id, name: 'HR Manager' },
  });
  const engMgrDesig = await prisma.designation.create({
    data: { companyId: acme.id, name: 'Engineering Manager' },
  });
  const teamLeadDesig = await prisma.designation.create({
    data: { companyId: acme.id, name: 'Frontend Team Lead' },
  });
  const devDesig = await prisma.designation.create({
    data: { companyId: acme.id, name: 'Software Engineer' },
  });

  // Team for Acme
  const frontendTeam = await prisma.team.create({
    data: { companyId: acme.id, departmentId: engDept.id, name: 'Frontend Team' },
  });

  // Acme Company Admin (CEO)
  const ceoUser = await prisma.user.create({
    data: {
      companyId: acme.id,
      email: 'ceo@acme.com',
      passwordHash,
      role: UserRole.COMPANY_ADMIN,
      dataScope: DataScope.COMPANY,
      isEmailVerified: true,
    },
  });
  const ceoEmp = await prisma.employee.create({
    data: {
      companyId: acme.id,
      userId: ceoUser.id,
      employeeCode: 'EMP-001',
      firstName: 'Arthur',
      lastName: 'Pendelton',
      departmentId: engDept.id,
      designationId: ceoDesig.id,
      hireDate: new Date('2024-01-01'),
      status: EmployeeStatus.ACTIVE,
    },
  });

  // Acme HR Manager
  const hrUser = await prisma.user.create({
    data: {
      companyId: acme.id,
      email: 'hr@acme.com',
      passwordHash,
      role: UserRole.HR_MANAGER,
      dataScope: DataScope.COMPANY,
      isEmailVerified: true,
    },
  });
  const hrEmp = await prisma.employee.create({
    data: {
      companyId: acme.id,
      userId: hrUser.id,
      employeeCode: 'EMP-002',
      firstName: 'Hannah',
      lastName: 'Ross',
      departmentId: hrDept.id,
      designationId: hrDesig.id,
      reportingManagerId: ceoEmp.id,
      hireDate: new Date('2024-02-01'),
      status: EmployeeStatus.ACTIVE,
    },
  });

  // Acme Department Manager
  const deptMgrUser = await prisma.user.create({
    data: {
      companyId: acme.id,
      email: 'eng.manager@acme.com',
      passwordHash,
      role: UserRole.DEPARTMENT_MANAGER,
      dataScope: DataScope.DEPARTMENT,
      isEmailVerified: true,
    },
  });
  const deptMgrEmp = await prisma.employee.create({
    data: {
      companyId: acme.id,
      userId: deptMgrUser.id,
      employeeCode: 'EMP-003',
      firstName: 'David',
      lastName: 'Miller',
      departmentId: engDept.id,
      designationId: engMgrDesig.id,
      reportingManagerId: ceoEmp.id,
      hireDate: new Date('2024-03-01'),
      status: EmployeeStatus.ACTIVE,
    },
  });
  await prisma.department.update({
    where: { id: engDept.id },
    data: { managerId: deptMgrEmp.id },
  });

  // Acme Team Lead
  const teamLeadUser = await prisma.user.create({
    data: {
      companyId: acme.id,
      email: 'team.lead@acme.com',
      passwordHash,
      role: UserRole.TEAM_LEAD,
      dataScope: DataScope.TEAM,
      isEmailVerified: true,
    },
  });
  const teamLeadEmp = await prisma.employee.create({
    data: {
      companyId: acme.id,
      userId: teamLeadUser.id,
      employeeCode: 'EMP-004',
      firstName: 'Tina',
      lastName: 'Lopez',
      departmentId: engDept.id,
      designationId: teamLeadDesig.id,
      teamId: frontendTeam.id,
      reportingManagerId: deptMgrEmp.id,
      hireDate: new Date('2024-04-01'),
      status: EmployeeStatus.ACTIVE,
    },
  });
  await prisma.team.update({
    where: { id: frontendTeam.id },
    data: { leadId: teamLeadEmp.id },
  });

  // Acme Regular Employee (Probation Completed)
  const empUser = await prisma.user.create({
    data: {
      companyId: acme.id,
      email: 'employee@acme.com',
      passwordHash,
      role: UserRole.EMPLOYEE,
      dataScope: DataScope.SELF,
      isEmailVerified: true,
    },
  });
  await prisma.employee.create({
    data: {
      companyId: acme.id,
      userId: empUser.id,
      employeeCode: 'EMP-005',
      firstName: 'Evan',
      lastName: 'Wright',
      departmentId: engDept.id,
      designationId: devDesig.id,
      teamId: frontendTeam.id,
      reportingManagerId: teamLeadEmp.id,
      hireDate: new Date('2024-05-01'), // > 3 months ago: probation completed
      status: EmployeeStatus.ACTIVE,
    },
  });

  // Acme Probationary Employee (Probation Active)
  const newbieUser = await prisma.user.create({
    data: {
      companyId: acme.id,
      email: 'newbie@acme.com',
      passwordHash,
      role: UserRole.EMPLOYEE,
      dataScope: DataScope.SELF,
      isEmailVerified: true,
    },
  });
  await prisma.employee.create({
    data: {
      companyId: acme.id,
      userId: newbieUser.id,
      employeeCode: 'EMP-006',
      firstName: 'Noah',
      lastName: 'Green',
      departmentId: engDept.id,
      designationId: devDesig.id,
      teamId: frontendTeam.id,
      reportingManagerId: teamLeadEmp.id,
      hireDate: new Date(), // Just hired: on probation!
      status: EmployeeStatus.ON_PROBATION,
    },
  });

  // 4. Demo Tenant 2: Globex Logistics (BASIC Tier)
  const globex = await prisma.company.upsert({
    where: { email: 'info@globex.com' },
    update: {},
    create: {
      name: 'Globex Logistics',
      slug: 'globex-logistics',
      email: 'info@globex.com',
      status: CompanyStatus.ACTIVE,
      subscriptionTier: SubscriptionTier.BASIC,
    },
  });
  console.log('✅ Seeded Company 2:', globex.name);

  const globexAdmin = await prisma.user.create({
    data: {
      companyId: globex.id,
      email: 'ceo@globex.com',
      passwordHash,
      role: UserRole.COMPANY_ADMIN,
      dataScope: DataScope.COMPANY,
      isEmailVerified: true,
    },
  });
  await prisma.employee.create({
    data: {
      companyId: globex.id,
      userId: globexAdmin.id,
      employeeCode: 'EMP-101',
      firstName: 'George',
      lastName: 'Globex',
      hireDate: new Date('2024-01-01'),
      status: EmployeeStatus.ACTIVE,
    },
  });

  console.log('🎉 Seeding complete! All 7 roles and 2 isolated tenants initialized.');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
