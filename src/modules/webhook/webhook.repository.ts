import { prisma } from '@infra/database/prisma-client';
import { Prisma } from '@prisma/client';

/**
 * Log a Zalo message and its parsing status to the PostgreSQL database.
 */
export async function createMessageLog(data: Prisma.MessageLogCreateInput) {
  return prisma.messageLog.create({ data });
}

/**
 * Update an existing message log (e.g. link it to a created order).
 */
export async function updateMessageLog(id: string, data: Prisma.MessageLogUpdateInput) {
  return prisma.messageLog.update({
    where: { id },
    data,
  });
}
