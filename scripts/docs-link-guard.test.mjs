/**
 * Tests de `docs-link-guard.mjs` (DOC-07, plan consolidado Fase 6).
 *
 *   node --test scripts/docs-link-guard.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  collectAnchors,
  extractLinks,
  findDocsLinkProblems,
  findFileUrls,
  githubSlug,
  headingPlainText,
  listVendoredSkillPrefixes,
} from './docs-link-guard.mjs';

/** Crea un repositorio de prueba con `files` ({ ruta: contenido }) y devuelve su raíz. */
function makeRepo(files) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-link-guard-'));
  for (const [file, content] of Object.entries(files)) {
    const fullPath = path.join(rootDir, file);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return rootDir;
}

/** Revisa un repositorio de prueba sin git: la lista de archivos es la de `files`. */
function check(files, options = {}) {
  const rootDir = makeRepo(files);
  try {
    return findDocsLinkProblems(rootDir, { files: Object.keys(files), skipPrefixes: [], ...options });
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

const messages = (result) => result.problems.map(({ file, line, message }) => `${file}:${line}: ${message}`);

test('githubSlug calcula las anclas como GitHub', () => {
  assert.equal(githubSlug('Instalación y Desarrollo Local'), 'instalación-y-desarrollo-local');
  assert.equal(githubSlug('🔑 Variables de Entorno'), '-variables-de-entorno');
  assert.equal(githubSlug('Fuente de Verdad & Invariantes (Excel vs BFlow)'), 'fuente-de-verdad--invariantes-excel-vs-bflow');
  assert.equal(githubSlug('6.3 Matriz de Retroalimentación'), '63-matriz-de-retroalimentación');
  assert.equal(githubSlug('snake_case y guiones-medios'), 'snake_case-y-guiones-medios');
});

test('headingPlainText quita el formato del título antes de calcular el ancla', () => {
  assert.equal(headingPlainText('`ci.yml` (Puerta de Enlace)'), 'ci.yml (Puerta de Enlace)');
  assert.equal(headingPlainText('Reglas en [`firestore.rules`](firestore.rules)'), 'Reglas en firestore.rules');
  assert.equal(headingPlainText('**Negrita** y _cursiva_ con snake_case'), 'Negrita y cursiva con snake_case');
  assert.equal(headingPlainText('A &amp; B <br> C'), 'A & B  C');
});

test('collectAnchors reúne títulos ATX y setext, repetidos con sufijo e ids de HTML', () => {
  const anchors = collectAnchors(
    [
      '# Título',
      '## Repetido',
      '## Repetido',
      'Setext',
      '------',
      '<a id="ancla-manual"></a>',
      '```md',
      '## Dentro de un bloque de código',
      '```',
    ].join('\n')
  );
  assert.deepEqual([...anchors].sort(), ['ancla-manual', 'repetido', 'repetido-1', 'setext', 'título']);
});

test('extractLinks ignora el código, los comentarios y el front matter', () => {
  const links = extractLinks(
    [
      '---',
      'description: "[no](front-matter.md)"',
      '---',
      '[uno](a.md) y ![imagen](img/logo.png "título")',
      '`[no](codigo.md)` y ``[tampoco](doble.md)``',
      '<!-- [no](comentario.md) -->',
      '```',
      '[no](bloque.md)',
      '```',
      '[ref]: docs/ref.md',
      '<a href="pagina.md">x</a>',
      '[con paréntesis](archivo(1).md) y [con espacios](<mi archivo.md>)',
      'Un `span de código',
      'en dos líneas <img src="no.png">` termina aquí.',
    ].join('\n')
  );
  assert.deepEqual(
    links.map(({ target, line }) => `${line}:${target}`),
    ['4:a.md', '4:img/logo.png', '10:docs/ref.md', '11:pagina.md', '12:archivo(1).md', '12:mi archivo.md']
  );
});

test('findFileUrls detecta file:// fuera del código', () => {
  const markdown = [
    '[enlace](file:///c:/Users/alguien/repo/README.md)',
    'Texto con `file:///c:/en/codigo` permitido.',
    '<file:///c:/autoenlace>',
  ].join('\n');
  assert.deepEqual(findFileUrls(markdown), [1, 3]);
});

test('un repositorio con enlaces correctos pasa', () => {
  const result = check({
    'README.md': [
      '# Proyecto',
      '## 🔑 Variables de Entorno',
      '[Ir](#-variables-de-entorno) · [Guía](docs/guia.md#pasos) · [Carpeta](src/) · [Código](src/app.ts#L10-L20)',
      '[Externo](https://example.com) · [Correo](mailto:alguien@example.com) · [Arriba](#)',
      '[Vista de código](docs/guia.md?plain=1#L3) · [Raíz](/docs/guia.md)',
    ].join('\n'),
    'docs/guia.md': '# Guía\n\n## Pasos\n\n[Volver](../README.md#proyecto)\n',
    'src/app.ts': 'export {};\n',
  });
  assert.deepEqual(messages(result), []);
  assert.equal(result.markdownFiles, 2);
  assert.equal(result.checkedLinks, 7);
});

test('falla con file://, archivos que no existen, anclas rotas y rutas fuera del repositorio', () => {
  const result = check({
    'README.md': [
      '[local](file:///c:/Users/alguien/repo/src/app.ts)',
      '[falta](docs/no-existe.md)',
      '[ancla](#no-existe)',
      '[ancla externa](docs/guia.md#tampoco)',
      '[fuera](../otro-repo/README.md)',
      '[windows](C:/Users/alguien/archivo.md)',
      '[línea en md sin plain](docs/guia.md#L3)',
    ].join('\n'),
    'docs/guia.md': '# Guía\n',
  });
  assert.deepEqual(messages(result), [
    'README.md:1: enlace `file://`: usa una ruta relativa al archivo',
    'README.md:2: `docs/no-existe.md` no existe en el repositorio',
    'README.md:3: el ancla `#no-existe` no existe en este archivo',
    'README.md:4: el ancla `#tampoco` no existe en `docs/guia.md`',
    'README.md:5: `../otro-repo/README.md` apunta fuera del repositorio',
    'README.md:6: ruta absoluta de Windows `C:/Users/alguien/archivo.md`: usa una ruta relativa',
    'README.md:7: el ancla `#L3` no existe en `docs/guia.md`',
  ]);
});

test('solo cuentan los archivos del repositorio: un archivo en disco sin versionar es un enlace roto', () => {
  const rootDir = makeRepo({ 'README.md': '[ignorado](.env)\n', '.env': 'SECRETO=1\n' });
  try {
    const result = findDocsLinkProblems(rootDir, { files: ['README.md'], skipPrefixes: [] });
    assert.deepEqual(messages(result), ['README.md:1: `.env` no existe en el repositorio']);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('no revisa node_modules ni las skills fijadas en skills-lock.json', () => {
  const rootDir = makeRepo({
    'skills-lock.json': JSON.stringify({ version: 1, skills: { 'skill-ajena': { source: 'otro/repo' } } }),
    '.agents/skills/skill-ajena/SKILL.md': '[hermana](../no-vendida/SKILL.md)\n',
    '.agents/skills/propia/SKILL.md': '[rota](../no-existe/SKILL.md)\n',
    'node_modules/paquete/README.md': '[rota](file:///c:/x)\n',
  });
  try {
    assert.deepEqual(listVendoredSkillPrefixes(rootDir), [
      '.agents/skills/skill-ajena/',
      '.claude/skills/skill-ajena/',
    ]);
    const result = findDocsLinkProblems(rootDir, {
      files: [
        'skills-lock.json',
        '.agents/skills/skill-ajena/SKILL.md',
        '.agents/skills/propia/SKILL.md',
        'node_modules/paquete/README.md',
      ],
    });
    assert.deepEqual(messages(result), [
      '.agents/skills/propia/SKILL.md:1: `../no-existe/SKILL.md` no existe en el repositorio',
    ]);
    assert.equal(result.skippedFiles, 1);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test('los Markdown versionados de BFlow no tienen enlaces rotos', () => {
  const result = findDocsLinkProblems(process.cwd());
  assert.deepEqual(messages(result), []);
  assert.ok(result.markdownFiles > 0);
});
