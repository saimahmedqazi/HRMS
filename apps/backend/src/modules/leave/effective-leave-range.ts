import { LeaveStatus, Prisma } from '@prisma/client';

export function approvedLeaveOverlapping(start: Date, end: Date): Prisma.LeaveRequestWhereInput {
  return {
    status: LeaveStatus.APPROVED,
    OR: [
      { approvedStart: { lte: end }, approvedEnd: { gte: start } },
      { approvedStart: null, startDate: { lte: end }, endDate: { gte: start } },
    ],
  };
}
