import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const [command, value] = process.argv.slice(2);

if (command === 'hash-password') {
  if (!value) {
    process.stderr.write('Uso: npm run admin:hash-password -- "contraseña"\n');
    process.exitCode = 1;
  } else {
    const generated = await hash(value, 12);
    process.stdout.write(`${generated}\nCopia este valor en ADMIN_PASSWORD_HASH.\n`);
  }
} else if (command === 'generate-secret') {
  process.stdout.write(`${randomBytes(48).toString('base64url')}\nCopia este valor en SESSION_SECRET.\n`);
} else if (command === 'generate-api-key') {
  process.stdout.write(`${randomBytes(32).toString('base64url')}\nCopia este valor en LOCAL_API_KEY y EXPO_PUBLIC_LOCAL_API_KEY.\n`);
} else {
  process.stderr.write('Comando de seguridad no válido.\n');
  process.exitCode = 1;
}
