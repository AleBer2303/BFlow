#!/usr/bin/env node
/**
 * scripts/release.mjs
 *
 * Prepara un release de BFlow en un solo paso (ADR 0023):
 *
 *   1. Valida que el árbol de git esté limpio, que la rama sea la de release (`main`) y que
 *      la versión sea la misma en todos los sitios donde vive.
 *   2. Sube la versión SemVer en `package.json`, `package-lock.json` y `app.json`
 *      (`expo.version`), incrementa `expo.android.versionCode` y, si existe,
 *      `expo.ios.buildNumber`.
 *   3. Crea el commit `chore(release): vX.Y.Z` y el tag anotado `vX.Y.Z`.
 *
 *   node scripts/release.mjs patch              # 0.1.0 -> 0.1.1
 *   node scripts/release.mjs minor --dry-run    # muestra el plan y no escribe nada
 *   node scripts/release.mjs 1.0.0 --push       # versión explícita y push atómico (rama + tag)
 *
 * Sin dependencias: solo Node y git. Lo usa `.github/workflows/release.yml`; en local sirve
 * para ensayar con `--dry-run` o para publicar a mano.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const BUMP_TYPES = ['patch', 'minor', 'major'];
export const DEFAULT_RELEASE_BRANCH = 'main';
export const VERSION_FILES = ['package.json', 'package-lock.json', 'app.json'];

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** "1.2.3" -> { major: 1, minor: 2, patch: 3 }. Solo SemVer estable, sin prerelease ni "v". */
export function parseSemver(version) {
  const match = typeof version === 'string' ? SEMVER_PATTERN.exec(version) : null;
  if (!match) {
    throw new Error(`Versión no válida: "${version}". Se espera X.Y.Z (por ejemplo 0.1.0).`);
  }
  const parts = { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
  if (!Object.values(parts).every(Number.isSafeInteger)) {
    throw new Error(`Versión fuera de rango: "${version}".`);
  }
  return parts;
}

export function formatSemver({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

/** Negativo si a < b, 0 si son iguales, positivo si a > b. */
export function compareSemver(a, b) {
  const left = parseSemver(a);
  const right = parseSemver(b);
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

/** Aplica un bump (`patch` | `minor` | `major`) a una versión. */
export function bumpVersion(current, bumpType) {
  const { major, minor, patch } = parseSemver(current);
  switch (bumpType) {
    case 'major':
      return formatSemver({ major: major + 1, minor: 0, patch: 0 });
    case 'minor':
      return formatSemver({ major, minor: minor + 1, patch: 0 });
    case 'patch':
      return formatSemver({ major, minor, patch: patch + 1 });
    default:
      throw new Error(
        `Tipo de bump no válido: "${bumpType}". Usa ${BUMP_TYPES.join(', ')} o una versión X.Y.Z.`
      );
  }
}

/** Resuelve la versión siguiente a partir de un bump o de una versión explícita mayor. */
export function resolveNextVersion(current, request) {
  if (BUMP_TYPES.includes(request)) {
    return bumpVersion(current, request);
  }
  if (typeof request === 'string' && SEMVER_PATTERN.test(request)) {
    if (compareSemver(request, current) <= 0) {
      throw new Error(`La versión ${request} debe ser mayor que la actual (${current}).`);
    }
    return request;
  }
  throw new Error(
    `Petición no válida: "${request}". Usa ${BUMP_TYPES.join(', ')} o una versión X.Y.Z.`
  );
}

export function toTagName(version) {
  return `v${version}`;
}

/** Interpreta los argumentos de la línea de comandos. */
export function parseArgs(argv) {
  const options = {
    request: null,
    dryRun: false,
    push: false,
    help: false,
    branch: DEFAULT_RELEASE_BRANCH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--push') {
      options.push = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--branch') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--branch necesita el nombre de una rama.');
      }
      options.branch = value;
      index += 1;
    } else if (arg.startsWith('--branch=')) {
      options.branch = arg.slice('--branch='.length);
      if (!options.branch) {
        throw new Error('--branch necesita el nombre de una rama.');
      }
    } else if (arg.startsWith('-')) {
      throw new Error(`Opción desconocida: ${arg}`);
    } else if (options.request === null) {
      options.request = arg;
    } else {
      throw new Error(`Argumento inesperado: ${arg}`);
    }
  }

  if (!options.help && options.request === null) {
    throw new Error(`Falta el tipo de bump (${BUMP_TYPES.join(', ')}) o una versión X.Y.Z.`);
  }
  return options;
}

/** Lista cada sitio donde vive la versión, con su valor actual. */
export function collectVersionSources({ packageJson, packageLock, appJson }) {
  return [
    { location: 'package.json → version', version: packageJson?.version },
    { location: 'package-lock.json → version', version: packageLock?.version },
    {
      location: 'package-lock.json → packages[""].version',
      version: packageLock?.packages?.['']?.version,
    },
    { location: 'app.json → expo.version', version: appJson?.expo?.version },
  ];
}

/** Devuelve la versión actual si todos los sitios coinciden; si no, lanza con el detalle. */
export function assertCoherentVersions(sources) {
  const missing = sources.filter((source) => typeof source.version !== 'string');
  if (missing.length > 0) {
    throw new Error(
      `No se encontró la versión en: ${missing.map((source) => source.location).join('; ')}.`
    );
  }
  const distinct = new Set(sources.map((source) => source.version));
  if (distinct.size !== 1) {
    const detail = sources.map((source) => `${source.location} = ${source.version}`).join('; ');
    throw new Error(`La versión no es la misma en todos los sitios: ${detail}.`);
  }
  const [current] = distinct;
  parseSemver(current);
  return current;
}

/** Siguiente `versionCode` de Android: entero positivo, siempre creciente. */
export function nextAndroidVersionCode(current) {
  if (!Number.isSafeInteger(current) || current < 1) {
    throw new Error(`expo.android.versionCode no es un entero positivo: ${JSON.stringify(current)}.`);
  }
  return current + 1;
}

/** Siguiente `buildNumber` de iOS: cadena numérica, siempre creciente. */
export function nextIosBuildNumber(current) {
  if (typeof current !== 'string' || !/^\d+$/.test(current)) {
    throw new Error(`expo.ios.buildNumber no es una cadena numérica: ${JSON.stringify(current)}.`);
  }
  const next = Number(current) + 1;
  if (!Number.isSafeInteger(next)) {
    throw new Error(`expo.ios.buildNumber fuera de rango: ${current}.`);
  }
  return String(next);
}

/**
 * Devuelve copias de los tres manifiestos con la versión nueva y la lista de cambios.
 * No modifica los objetos de entrada.
 */
export function applyVersion({ packageJson, packageLock, appJson }, nextVersion) {
  parseSemver(nextVersion);
  const current = assertCoherentVersions(
    collectVersionSources({ packageJson, packageLock, appJson })
  );

  const nextPackageJson = structuredClone(packageJson);
  const nextPackageLock = structuredClone(packageLock);
  const nextAppJson = structuredClone(appJson);
  const changes = [];

  nextPackageJson.version = nextVersion;
  changes.push({ location: 'package.json → version', from: current, to: nextVersion });

  nextPackageLock.version = nextVersion;
  changes.push({ location: 'package-lock.json → version', from: current, to: nextVersion });
  nextPackageLock.packages[''].version = nextVersion;
  changes.push({
    location: 'package-lock.json → packages[""].version',
    from: current,
    to: nextVersion,
  });

  nextAppJson.expo.version = nextVersion;
  changes.push({ location: 'app.json → expo.version', from: current, to: nextVersion });

  const android = nextAppJson.expo.android;
  if (android && android.versionCode !== undefined) {
    const from = android.versionCode;
    android.versionCode = nextAndroidVersionCode(from);
    changes.push({
      location: 'app.json → expo.android.versionCode',
      from,
      to: android.versionCode,
    });
  }

  const ios = nextAppJson.expo.ios;
  if (ios && ios.buildNumber !== undefined) {
    const from = ios.buildNumber;
    ios.buildNumber = nextIosBuildNumber(from);
    changes.push({ location: 'app.json → expo.ios.buildNumber', from, to: ios.buildNumber });
  }

  return {
    packageJson: nextPackageJson,
    packageLock: nextPackageLock,
    appJson: nextAppJson,
    changes,
  };
}

/**
 * Comprueba las condiciones del repositorio. Devuelve la lista de problemas (vacía si se
 * puede publicar); no lanza, para que `--dry-run` pueda mostrarlos todos a la vez.
 */
export function validateRepositoryState({
  statusPorcelain,
  currentBranch,
  releaseBranch = DEFAULT_RELEASE_BRANCH,
  existingTags = [],
  tagName,
}) {
  const problems = [];

  const dirtyEntries = statusPorcelain.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (dirtyEntries.length > 0) {
    problems.push(
      `El árbol de git no está limpio (${dirtyEntries.length} ${
        dirtyEntries.length === 1 ? 'archivo' : 'archivos'
      } con cambios o sin seguimiento). Haz commit o descarta los cambios antes de publicar.`
    );
  }

  if (currentBranch !== releaseBranch) {
    problems.push(
      `La rama actual es "${currentBranch}" y el release sale de "${releaseBranch}".`
    );
  }

  if (existingTags.includes(tagName)) {
    problems.push(`El tag ${tagName} ya existe.`);
  }

  return problems;
}

/** Serializa JSON con 2 espacios, respetando el fin de línea y el salto final del original. */
export function serializeJsonLike(originalText, value) {
  const eol = originalText.includes('\r\n') ? '\r\n' : '\n';
  const body = JSON.stringify(value, null, 2).replace(/\n/g, eol);
  return /\r?\n$/.test(originalText) ? `${body}${eol}` : body;
}

export function buildCommitMessage(version) {
  return `chore(release): ${toTagName(version)}`;
}

// ---------------------------------------------------------------------------------------
// Entrada/salida: todo lo de abajo toca git o el disco y solo se ejecuta desde la CLI.
// ---------------------------------------------------------------------------------------

const HELP_TEXT = `Uso: node scripts/release.mjs <patch|minor|major|X.Y.Z> [opciones]

Opciones:
  --dry-run          Muestra el plan y los bloqueos; no escribe archivos, commits ni tags.
  --push             Tras crear el commit y el tag, hace push atómico de la rama y el tag.
  --branch <nombre>  Rama desde la que se publica (por defecto: ${DEFAULT_RELEASE_BRANCH}).
  -h, --help         Muestra esta ayuda.
`;

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).replace(/\r?\n$/, '');
}

function readManifests(rootDir) {
  const texts = {};
  const manifests = {};
  for (const file of VERSION_FILES) {
    texts[file] = fs.readFileSync(path.join(rootDir, file), 'utf8');
    manifests[file] = JSON.parse(texts[file]);
  }
  return { texts, manifests };
}

export function runRelease(argv, { rootDir = process.cwd(), log = console.log } = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    log(HELP_TEXT);
    return { exitCode: 0 };
  }

  const { texts, manifests } = readManifests(rootDir);
  const input = {
    packageJson: manifests['package.json'],
    packageLock: manifests['package-lock.json'],
    appJson: manifests['app.json'],
  };

  const currentVersion = assertCoherentVersions(collectVersionSources(input));
  const nextVersion = resolveNextVersion(currentVersion, options.request);
  const tagName = toTagName(nextVersion);
  const result = applyVersion(input, nextVersion);

  const problems = validateRepositoryState({
    statusPorcelain: git(['status', '--porcelain'], rootDir),
    currentBranch: git(['rev-parse', '--abbrev-ref', 'HEAD'], rootDir),
    releaseBranch: options.branch,
    existingTags: git(['tag', '--list', tagName], rootDir)
      .split(/\r?\n/)
      .filter(Boolean),
    tagName,
  });

  log(`Release ${currentVersion} -> ${nextVersion} (tag ${tagName})`);
  for (const change of result.changes) {
    log(`  ${change.location}: ${change.from} -> ${change.to}`);
  }
  log(`  Commit: ${buildCommitMessage(nextVersion)}`);
  log(`  Tag anotado: ${tagName}`);
  if (options.push) {
    log(`  Push atómico: origin ${options.branch} ${tagName}`);
  }

  if (problems.length > 0) {
    log('');
    log('Bloqueos:');
    for (const problem of problems) {
      log(`  - ${problem}`);
    }
  }

  if (options.dryRun) {
    log('');
    log('Ensayo (--dry-run): no se escribió ningún archivo, commit ni tag.');
    return { exitCode: problems.length > 0 ? 1 : 0, currentVersion, nextVersion, tagName };
  }

  if (problems.length > 0) {
    return { exitCode: 1, currentVersion, nextVersion, tagName };
  }

  const outputs = {
    'package.json': result.packageJson,
    'package-lock.json': result.packageLock,
    'app.json': result.appJson,
  };
  for (const file of VERSION_FILES) {
    fs.writeFileSync(path.join(rootDir, file), serializeJsonLike(texts[file], outputs[file]));
  }

  git(['add', '--', ...VERSION_FILES], rootDir);
  git(['commit', '-m', buildCommitMessage(nextVersion)], rootDir);
  git(['tag', '-a', tagName, '-m', `BFlow ${tagName}`], rootDir);
  log('');
  log(`Commit y tag ${tagName} creados.`);

  if (options.push) {
    git(['push', '--atomic', 'origin', options.branch, tagName], rootDir);
    log(`Push hecho: origin ${options.branch} ${tagName}.`);
  } else {
    log(`Para publicar: git push --atomic origin ${options.branch} ${tagName}`);
  }

  // En GitHub Actions deja la versión y el tag como salidas del paso.
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${nextVersion}\ntag=${tagName}\n`);
  }

  return { exitCode: 0, currentVersion, nextVersion, tagName };
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  try {
    const { exitCode } = runRelease(process.argv.slice(2));
    process.exit(exitCode);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
