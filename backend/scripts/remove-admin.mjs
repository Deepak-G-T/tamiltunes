import { db } from '../src/prisma/client.js';

const rawEmail = process.argv[2];
if (!rawEmail || !rawEmail.trim()) {
  console.error('Usage: npm run remove-admin -- <email>');
  process.exit(1);
}

const email = rawEmail.trim().toLowerCase();

async function main() {
  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`Error: User with email "${email}" not found in database.`);
      process.exit(1);
    }

    if (user.role === 'user') {
      console.log(`User "${email}" is already a standard user.`);
      process.exit(0);
    }

    const previousRole = user.role;
    await db.user.update({
      where: { id: user.id },
      data: { role: 'user' }
    });

    try {
      await db.auditLog.create({
        data: {
          actorId: null,
          actorEmail: 'cli:remove-admin',
          action: 'role_change',
          targetType: 'user',
          targetId: user.id,
          details: {
            previousRole,
            newRole: 'user',
            email: user.email,
            reason: 'CLI demotion'
          },
          ip: '127.0.0.1'
        }
      });
    } catch (auditErr) {
      console.warn('Note: Could not write to audit_logs (migration may not yet be applied on this db).');
    }

    console.log(`Success: User "${email}" demoted to standard user.`);
  } catch (err) {
    console.error('Failed to demote user:', err.message);
    process.exit(1);
  } finally {
    await db.$disconnect().catch(() => {});
  }
}

main();
