/**
 * Correo del propietario de la semilla por variable de entorno (ADR 0027).
 */

import { isOwnerCanonicalEmail } from '../../../data/repositories/budgetRepository';
import { DEMO_OWNER_USER } from '../../auth/authAdapter';
import { DEMO_OWNER_SEED_EMAIL, resolveOwnerSeedEmails } from '../ownerSeedEmail';

const PRODUCTION = { isTestRuntime: false, isDemoMode: false };

interface DirEntry {
  name: string;
  isDirectory(): boolean;
}

// El proyecto no instala los tipos de Node: se declara solo lo que usa este test.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as {
  readFileSync: (p: string, enc: string) => string;
  readdirSync: (p: string, options: { withFileTypes: true }) => DirEntry[];
};

function listSourceFiles(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') listSourceFiles(fullPath, files);
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('resolveOwnerSeedEmails', () => {
  it('en un build real sin variable ninguna cuenta es propietaria', () => {
    expect(resolveOwnerSeedEmails({ ...PRODUCTION, configuredEmail: undefined }).size).toBe(0);
    expect(resolveOwnerSeedEmails({ ...PRODUCTION, configuredEmail: '   ' }).size).toBe(0);
  });

  it('acepta el correo configurado, normalizado, y no añade el de vitrina', () => {
    const emails = resolveOwnerSeedEmails({
      ...PRODUCTION,
      configuredEmail: '  Owner@Example.org ',
    });

    expect(emails.has('owner@example.org')).toBe(true);
    expect(emails.has('ownerexample.org')).toBe(true);
    expect(emails.has(DEMO_OWNER_SEED_EMAIL)).toBe(false);
  });

  it('ignora un valor que no es un correo', () => {
    expect(resolveOwnerSeedEmails({ ...PRODUCTION, configuredEmail: 'not-an-email' }).size).toBe(0);
  });

  it('los tests y el modo vitrina añaden la dirección ficticia', () => {
    const inTests = resolveOwnerSeedEmails({ isTestRuntime: true, isDemoMode: false, configuredEmail: '' });
    const inDemo = resolveOwnerSeedEmails({
      isTestRuntime: false,
      isDemoMode: true,
      configuredEmail: 'owner@example.org',
    });

    expect([...inTests]).toEqual([DEMO_OWNER_SEED_EMAIL]);
    expect(inDemo.has(DEMO_OWNER_SEED_EMAIL)).toBe(true);
    expect(inDemo.has('owner@example.org')).toBe(true);
  });
});

describe('propietario de la semilla en la app', () => {
  it('el usuario de vitrina usa la dirección ficticia y recibe la semilla', () => {
    expect(DEMO_OWNER_USER.email).toBe(DEMO_OWNER_SEED_EMAIL);
    expect(isOwnerCanonicalEmail(DEMO_OWNER_USER.email)).toBe(true);
    expect(isOwnerCanonicalEmail('  DEMO.OWNER@BFLOW.EXAMPLE ')).toBe(true);
  });

  it('cualquier otra cuenta arranca sin semilla', () => {
    expect(isOwnerCanonicalEmail('someone@example.org')).toBe(false);
    expect(isOwnerCanonicalEmail(null)).toBe(false);
    expect(isOwnerCanonicalEmail('')).toBe(false);
  });

  it('el código que se empaqueta no contiene buzones personales', () => {
    const personalMailbox = /[a-z0-9._-]+@(gmail|hotmail|outlook|yahoo|icloud)\.[a-z.]+/i;
    const sourceFiles = listSourceFiles('src');
    expect(sourceFiles.length).toBeGreaterThan(100);

    const offenders = sourceFiles.filter((file) =>
      personalMailbox.test(fs.readFileSync(file, 'utf8'))
    );

    expect(offenders).toEqual([]);
  });
});
