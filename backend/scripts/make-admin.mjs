import { db } from '../src/prisma/client.js';

const rawEmail = process.argv[2];
if (!rawEmail || !rawEmail.trim()) {
  console.error('Usage: npm run make-admin -- <email>');
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

    if (user.role === 'admin') {
      console.log(`User "${email}" is already an admin.`);
      process.exit(0);
    }

    const previousRole = user.role;
    await db.user.update({
      where: { id: user.id },
      data: { role: 'admin' }
    });

    try {
      await db.auditLog.create({
        data: {
          actorId: null,
          actorEmail: 'cli:make-admin',
          action: 'role_change',
          targetType: 'user',
          targetId: user.id,
          details: {
            previousRole,
            newRole: 'admin',
            email: user.email,
            reason: 'CLI promotion'
          },
          ip: '127.0.0.1'
        }
      });
    } catch (auditErr) {
      console.warn('Note: Could not write to audit_logs (migration may not yet be applied on this db).');
    }

    console.log(`Success: User "${email}" promoted to admin.`);
  } catch (err) {
    console.error('Failed to promote user:', err.message);
    process.exit(1);
  } finally {
    await db.$disconnect().catch(() => {});
  }
}

main();
