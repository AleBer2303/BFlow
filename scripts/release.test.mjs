import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  applyVersion,
  assertCoherentVersions,
  buildCommitMessage,
  bumpVersion,
  collectVersionSources,
  compareSemver,
  nextAndroidVersionCode,
  nextIosBuildNumber,
  parseArgs,
  parseSemver,
  resolveNextVersion,
  serializeJsonLike,
  toTagName,
  validateRepositoryState,
  VERSION_FILES,
} from './release.mjs';

const rootDir = process.cwd();

function buildManifests(overrides = {}) {
  return {
    packageJson: { name: 'bflow', version: '0.1.0', ...overrides.packageJson },
    packageLock: {
      name: 'bflow',
      version: '0.1.0',
      packages: { '': { name: 'bflow', version: '0.1.0' } },
      ...overrides.packageLock,
    },
    appJson: {
      expo: {
        name: 'BFlow',
        version: '0.1.0',
        ios: { bundleIdentifier: 'com.bflow.app' },
        android: { package: 'com.bflow.app', versionCode: 1 },
        ...overrides.expo,
      },
    },
  };
}

test('parseSemver — acepta X.Y.Z y rechaza lo demás', () => {
  assert.deepEqual(parseSemver('0.1.0'), { major: 0, minor: 1, patch: 0 });
  assert.deepEqual(parseSemver('12.34.56'), { major: 12, minor: 34, patch: 56 });

  for (const invalid of ['v1.2.3', '1.2', '1.2.3.4', '1.2.3-beta.1', '01.2.3', '1.2.x', '', null, 123]) {
    assert.throws(() => parseSemver(invalid), /Versión no válida/, `debe rechazar ${invalid}`);
  }
});

test('bumpVersion — patch, minor y major reinician los componentes menores', () => {
  assert.equal(bumpVersion('0.1.0', 'patch'), '0.1.1');
  assert.equal(bumpVersion('0.1.9', 'patch'), '0.1.10');
  assert.equal(bumpVersion('0.1.7', 'minor'), '0.2.0');
  assert.equal(bumpVersion('0.9.7', 'major'), '1.0.0');
  assert.equal(bumpVersion('1.99.99', 'major'), '2.0.0');
  assert.throws(() => bumpVersion('0.1.0', 'prerelease'), /Tipo de bump no válido/);
});

test('compareSemver — ordena numéricamente, no como texto', () => {
  assert.ok(compareSemver('0.10.0', '0.9.0') > 0);
  assert.ok(compareSemver('1.0.0', '0.99.99') > 0);
  assert.ok(compareSemver('0.1.0', '0.1.1') < 0);
  assert.equal(compareSemver('2.3.4', '2.3.4'), 0);
});

test('resolveNextVersion — admite un bump o una versión explícita mayor', () => {
  assert.equal(resolveNextVersion('0.1.0', 'patch'), '0.1.1');
  assert.equal(resolveNextVersion('0.1.0', 'minor'), '0.2.0');
  assert.equal(resolveNextVersion('0.1.0', 'major'), '1.0.0');
  assert.equal(resolveNextVersion('0.1.0', '0.3.0'), '0.3.0');

  assert.throws(() => resolveNextVersion('0.1.0', '0.1.0'), /debe ser mayor/);
  assert.throws(() => resolveNextVersion('0.2.0', '0.1.9'), /debe ser mayor/);
  assert.throws(() => resolveNextVersion('0.1.0', 'v0.2.0'), /Petición no válida/);
  assert.throws(() => resolveNextVersion('0.1.0', 'hotfix'), /Petición no válida/);
});

test('toTagName y buildCommitMessage — siguen la convención vX.Y.Z', () => {
  assert.equal(toTagName('1.2.3'), 'v1.2.3');
  assert.equal(buildCommitMessage('1.2.3'), 'chore(release): v1.2.3');
});

test('parseArgs — interpreta bump, opciones y errores', () => {
  assert.deepEqual(parseArgs(['patch']), {
    request: 'patch',
    dryRun: false,
    push: false,
    help: false,
    branch: 'main',
  });
  assert.deepEqual(parseArgs(['--dry-run', 'minor', '--branch', 'develop', '--push']), {
    request: 'minor',
    dryRun: true,
    push: true,
    help: false,
    branch: 'develop',
  });
  assert.equal(parseArgs(['1.0.0', '--branch=release']).branch, 'release');
  assert.equal(parseArgs(['--help']).help, true);

  assert.throws(() => parseArgs([]), /Falta el tipo de bump/);
  assert.throws(() => parseArgs(['patch', 'minor']), /Argumento inesperado/);
  assert.throws(() => parseArgs(['patch', '--force']), /Opción desconocida/);
  assert.throws(() => parseArgs(['patch', '--branch']), /--branch necesita/);
  assert.throws(() => parseArgs(['patch', '--branch', '--push']), /--branch necesita/);
  assert.throws(() => parseArgs(['patch', '--branch=']), /--branch necesita/);
});

test('assertCoherentVersions — exige la misma versión en todos los sitios', () => {
  assert.equal(assertCoherentVersions(collectVersionSources(buildManifests())), '0.1.0');

  const drifted = buildManifests({ expo: { version: '0.2.0' } });
  assert.throws(
    () => assertCoherentVersions(collectVersionSources(drifted)),
    /no es la misma en todos los sitios.*app\.json → expo\.version = 0\.2\.0/
  );

  const lockDrift = buildManifests({
    packageLock: { version: '0.1.0', packages: { '': { version: '0.0.9' } } },
  });
  assert.throws(() => assertCoherentVersions(collectVersionSources(lockDrift)), /no es la misma/);

  const missing = buildManifests();
  delete missing.appJson.expo.version;
  assert.throws(
    () => assertCoherentVersions(collectVersionSources(missing)),
    /No se encontró la versión en: app\.json → expo\.version/
  );
});

test('nextAndroidVersionCode y nextIosBuildNumber — siempre crecen y validan el tipo', () => {
  assert.equal(nextAndroidVersionCode(1), 2);
  assert.equal(nextAndroidVersionCode(41), 42);
  for (const invalid of [0, -1, 1.5, '1', null, undefined]) {
    assert.throws(() => nextAndroidVersionCode(invalid), /versionCode/);
  }

  assert.equal(nextIosBuildNumber('1'), '2');
  assert.equal(nextIosBuildNumber('99'), '100');
  for (const invalid of [1, '1.0', 'abc', '', null]) {
    assert.throws(() => nextIosBuildNumber(invalid), /buildNumber/);
  }
});

test('applyVersion — sube la versión en todos los sitios y el versionCode de Android', () => {
  const manifests = buildManifests();
  const snapshot = JSON.stringify(manifests);
  const result = applyVersion(manifests, '0.2.0');

  assert.equal(result.packageJson.version, '0.2.0');
  assert.equal(result.packageLock.version, '0.2.0');
  assert.equal(result.packageLock.packages[''].version, '0.2.0');
  assert.equal(result.appJson.expo.version, '0.2.0');
  assert.equal(result.appJson.expo.android.versionCode, 2);
  assert.equal('buildNumber' in result.appJson.expo.ios, false, 'no inventa ios.buildNumber');

  assert.deepEqual(
    result.changes.map((change) => change.location),
    [
      'package.json → version',
      'package-lock.json → version',
      'package-lock.json → packages[""].version',
      'app.json → expo.version',
      'app.json → expo.android.versionCode',
    ]
  );
  assert.equal(JSON.stringify(manifests), snapshot, 'no modifica los objetos de entrada');
  assert.equal(assertCoherentVersions(collectVersionSources(result)), '0.2.0');
});

test('applyVersion — incrementa ios.buildNumber solo si ya existe', () => {
  const manifests = buildManifests({
    expo: {
      version: '0.1.0',
      ios: { bundleIdentifier: 'com.bflow.app', buildNumber: '7' },
      android: { package: 'com.bflow.app', versionCode: 7 },
    },
  });
  const result = applyVersion(manifests, '0.1.1');
  assert.equal(result.appJson.expo.ios.buildNumber, '8');
  assert.equal(result.appJson.expo.android.versionCode, 8);
});

test('applyVersion — se niega si las versiones de partida no coinciden', () => {
  const drifted = buildManifests({ packageJson: { version: '0.3.0' } });
  assert.throws(() => applyVersion(drifted, '0.4.0'), /no es la misma/);
  assert.throws(() => applyVersion(buildManifests(), 'v0.2.0'), /Versión no válida/);
});

test('validateRepositoryState — árbol limpio, rama y tag', () => {
  const clean = {
    statusPorcelain: '',
    currentBranch: 'main',
    releaseBranch: 'main',
    existingTags: ['v0.1.0'],
    tagName: 'v0.1.1',
  };
  assert.deepEqual(validateRepositoryState(clean), []);

  const dirty = validateRepositoryState({
    ...clean,
    statusPorcelain: ' M src/app/index.tsx\n?? notas.txt\n',
  });
  assert.equal(dirty.length, 1);
  assert.match(dirty[0], /no está limpio \(2 archivos/);

  const wrongBranch = validateRepositoryState({ ...clean, currentBranch: 'feature/x' });
  assert.equal(wrongBranch.length, 1);
  assert.match(wrongBranch[0], /"feature\/x".*"main"/);

  const duplicateTag = validateRepositoryState({ ...clean, existingTags: ['v0.1.1'] });
  assert.deepEqual(duplicateTag, ['El tag v0.1.1 ya existe.']);

  const everything = validateRepositoryState({
    statusPorcelain: ' M app.json',
    currentBranch: 'HEAD',
    releaseBranch: 'main',
    existingTags: ['v0.1.1'],
    tagName: 'v0.1.1',
  });
  assert.equal(everything.length, 3, 'informa todos los bloqueos a la vez');
});

test('serializeJsonLike — respeta el fin de línea y el salto final del original', () => {
  const value = { a: 1, b: { c: [1, 2] } };
  const lf = `${JSON.stringify(value, null, 2)}\n`;
  assert.equal(serializeJsonLike(lf, value), lf);

  const crlf = lf.replace(/\n/g, '\r\n');
  assert.equal(serializeJsonLike(crlf, value), crlf);

  const withoutFinalNewline = JSON.stringify(value, null, 2);
  assert.equal(serializeJsonLike(withoutFinalNewline, value), withoutFinalNewline);
});

test('Manifiestos reales — versiones coherentes y reescritura sin cambios de formato', () => {
  const texts = Object.fromEntries(
    VERSION_FILES.map((file) => [file, fs.readFileSync(path.resolve(rootDir, file), 'utf8')])
  );
  const manifests = {
    packageJson: JSON.parse(texts['package.json']),
    packageLock: JSON.parse(texts['package-lock.json']),
    appJson: JSON.parse(texts['app.json']),
  };

  // Si este test falla, alguien cambió la versión en un sitio y no en los demás.
  const current = assertCoherentVersions(collectVersionSources(manifests));

  // El release solo debe tocar las líneas de versión: serializar sin cambios da el mismo texto.
  assert.equal(serializeJsonLike(texts['package.json'], manifests.packageJson), texts['package.json']);
  assert.equal(
    serializeJsonLike(texts['package-lock.json'], manifests.packageLock),
    texts['package-lock.json']
  );
  assert.equal(serializeJsonLike(texts['app.json'], manifests.appJson), texts['app.json']);

  const next = applyVersion(manifests, bumpVersion(current, 'patch'));
  assert.equal(
    next.appJson.expo.android.versionCode,
    manifests.appJson.expo.android.versionCode + 1
  );
});
