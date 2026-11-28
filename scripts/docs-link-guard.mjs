#!/usr/bin/env node
/**
 * scripts/docs-link-guard.mjs
 *
 * Guardia de Docs-as-Code (DOC-07, plan consolidado Fase 6). Revisa todos los
 * `.md` del repositorio (versionados o nuevos sin ignorar, nunca `node_modules`)
 * y falla si alguno tiene:
 *
 *   1. Un enlace `file:///` (o una ruta absoluta de Windows como `C:/...`).
 *   2. Un enlace relativo a un archivo o carpeta que no está en el repositorio.
 *   3. Un ancla (`#seccion`) que no existe en el Markdown de destino.
 *
 * El código (bloques con ``` o ~~~ y `spans` en línea) y los comentarios HTML no
 * se revisan: ahí `file:///` o `[x](y)` son texto, no enlaces.
 *
 * Las anclas se calculan como GitHub (`github-slugger`): minúsculas, fuera todo
 * lo que no sea letra, número, marca, `_`, `-` o espacio, y cada espacio a `-`.
 * Los títulos repetidos reciben `-1`, `-2`... Las anclas de archivos que no son
 * Markdown (`archivo.ts#L10`) no se comprueban.
 *
 * Se ejecuta en `npm run lint`; sus tests están en `npm run test:scripts`.
 *
 *   node scripts/docs-link-guard.mjs
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MARKDOWN_EXTENSION = /\.md$/i;
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const WINDOWS_ABSOLUTE_PATH = /^[a-z]:[\\/]/i;
const FILE_URL = /file:\/\//i;
const LINE_ANCHOR = /^L\d+(?:-L\d+)?$/;

/** Ancla de un título al estilo de GitHub (`github-slugger`). */
export function githubSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /g, '-');
}

const HTML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', '#39': "'" };

/** Texto visible de un título en Markdown, como lo pinta GitHub antes de calcular el ancla. */
export function headingPlainText(rawHeading) {
  return rawHeading
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`+/g, '')
    .replace(/\*+|~~/g, '')
    .replace(/(^|[^\p{L}\p{N}])_+(?=\S)/gu, '$1')
    .replace(/(?<=\S)_+(?=[^\p{L}\p{N}]|$)/gu, '')
    .replace(/&(#39|[a-z]+);/gi, (match, name) => HTML_ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\\(.)/g, '$1')
    .trim();
}

/** Tapa el `front matter` YAML del principio (las `SKILL.md` lo usan). */
function maskFrontMatter(lines) {
  if (lines[0]?.trim() !== '---') return lines;
  const end = lines.findIndex((line, index) => index > 0 && /^(---|\.\.\.)\s*$/.test(line));
  if (end === -1) return lines;
  return lines.map((line, index) => (index <= end ? '' : line));
}

/** Tapa los bloques de código cercados (``` o ~~~), también dentro de listas y citas. */
function maskFencedCode(lines) {
  const masked = [];
  let fence = null;
  for (const line of lines) {
    const content = line.replace(/^\s*(?:>\s?)*\s*/, '');
    if (fence) {
      masked.push('');
      const closing = content.match(/^(`{3,}|~{3,})\s*$/);
      if (closing && closing[1][0] === fence.char && closing[1].length >= fence.length) fence = null;
      continue;
    }
    const opening = content.match(/^(`{3,}|~{3,})(.*)$/);
    if (opening && !(opening[1][0] === '`' && opening[2].includes('`'))) {
      fence = { char: opening[1][0], length: opening[1].length };
      masked.push('');
      continue;
    }
    masked.push(line);
  }
  return masked;
}

/**
 * Tapa los `spans` de código en línea (CommonMark: el cierre tiene tantas comillas
 * como la apertura). Acepta un bloque de varias líneas y conserva los saltos.
 */
export function maskInlineCode(text) {
  let output = '';
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '\\' && index + 1 < text.length) {
      output += text.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (char !== '`') {
      output += char;
      index += 1;
      continue;
    }
    let runEnd = index;
    while (text[runEnd] === '`') runEnd += 1;
    const ticks = runEnd - index;
    let cursor = runEnd;
    let closing = -1;
    while (cursor < text.length) {
      if (text[cursor] !== '`') {
        cursor += 1;
        continue;
      }
      let closeEnd = cursor;
      while (text[closeEnd] === '`') closeEnd += 1;
      if (closeEnd - cursor === ticks) {
        closing = cursor;
        break;
      }
      cursor = closeEnd;
    }
    if (closing === -1) {
      output += text.slice(index, runEnd);
      index = runEnd;
      continue;
    }
    output += text.slice(index, closing + ticks).replace(/[^\n]/g, ' ');
    index = closing + ticks;
  }
  return output;
}

/** Línea que abre un bloque nuevo: un `span` de código no cruza de una a otra. */
const BLOCK_START = /^\s*(?:$|[-*+]\s|\d+[.)]\s|\||#|>)/;

/** Aplica `maskInlineCode` por bloques (párrafo, elemento de lista, fila de tabla). */
function maskInlineCodeByBlock(lines) {
  const masked = [];
  let block = [];
  const flush = () => {
    if (block.length > 0) masked.push(...maskInlineCode(block.join('\n')).split('\n'));
    block = [];
  };
  for (const line of lines) {
    if (BLOCK_START.test(line)) flush();
    block.push(line);
  }
  flush();
  return masked;
}

/** Tapa los comentarios HTML (pueden ocupar varias líneas) sin mover los números de línea. */
function maskHtmlComments(lines) {
  return lines
    .join('\n')
    .replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ' '))
    .split('\n');
}

/**
 * Prepara un Markdown para revisarlo: líneas sin código (para buscar enlaces) y
 * líneas sin bloques de código pero con el texto de los títulos intacto.
 */
export function prepareMarkdown(markdown) {
  const raw = markdown.replace(/\r\n?/g, '\n').split('\n');
  const withoutFences = maskFencedCode(maskFrontMatter(raw));
  const withoutCode = maskHtmlComments(maskInlineCodeByBlock(withoutFences));
  return { withoutFences, withoutCode };
}

const ATX_HEADING = /^ {0,3}(?:>\s?)*\s*#{1,6}(?:[ \t]+(.*?))?[ \t]*$/;
const SETEXT_UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/;
const NOT_A_PARAGRAPH = /^\s*(?:$|[-*+]\s|\d+[.)]\s|\||#|<|>|`{3,}|~{3,})/;

/** Todas las anclas de un Markdown: títulos (ATX y setext) e `id`/`name` de HTML. */
export function collectAnchors(markdown) {
  const { withoutFences, withoutCode } = prepareMarkdown(markdown);
  const anchors = new Set();
  const occurrences = new Map();
  const addHeading = (text) => {
    const base = githubSlug(headingPlainText(text));
    let slug = base;
    const seen = occurrences.get(base) ?? 0;
    if (seen > 0) slug = `${base}-${seen}`;
    occurrences.set(base, seen + 1);
    anchors.add(slug);
  };

  withoutFences.forEach((line, index) => {
    if (withoutCode[index].trim() === '' && line.trim() === '') return;
    const atx = line.match(ATX_HEADING);
    if (atx && withoutCode[index].trim() !== '') {
      addHeading((atx[1] ?? '').replace(/[ \t]+#+$/, ''));
      return;
    }
    const next = withoutFences[index + 1];
    if (next !== undefined && SETEXT_UNDERLINE.test(next) && !NOT_A_PARAGRAPH.test(line)) {
      addHeading(line.trim());
    }
  });

  for (const line of withoutCode) {
    for (const match of line.matchAll(/<[a-z][^>]*?\s(?:id|name)\s*=\s*["']([^"']+)["']/gi)) {
      anchors.add(match[1]);
    }
  }
  return anchors;
}

/** Lee el destino de un enlace en línea a partir del `(`; respeta `<...>` y paréntesis anidados. */
function readInlineDestination(line, start) {
  let index = start;
  while (line[index] === ' ' || line[index] === '\t') index += 1;
  if (line[index] === '<') {
    const end = line.indexOf('>', index + 1);
    return end === -1 ? null : line.slice(index + 1, end);
  }
  let depth = 0;
  let target = '';
  while (index < line.length) {
    const char = line[index];
    if (char === '\\' && index + 1 < line.length) {
      target += line[index + 1];
      index += 2;
      continue;
    }
    if (char === ' ' || char === '\t') break;
    if (char === '(') depth += 1;
    if (char === ')') {
      if (depth === 0) break;
      depth -= 1;
    }
    target += char;
    index += 1;
  }
  return target;
}

/** Enlaces de un Markdown con su línea: en línea, imágenes, definiciones de referencia y `href`/`src`. */
export function extractLinks(markdown) {
  const { withoutCode } = prepareMarkdown(markdown);
  const links = [];
  withoutCode.forEach((line, index) => {
    const lineNumber = index + 1;
    for (const match of line.matchAll(/\]\(/g)) {
      const target = readInlineDestination(line, match.index + 2);
      if (target !== null) links.push({ target, line: lineNumber });
    }
    const definition = line.match(/^ {0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/);
    if (definition) links.push({ target: definition[1].replace(/^<|>$/g, ''), line: lineNumber });
    for (const match of line.matchAll(/\s(?:href|src)\s*=\s*["']([^"']*)["']/gi)) {
      links.push({ target: match[1], line: lineNumber });
    }
  });
  return links;
}

/** Líneas con `file://` fuera del código (enlace, autoenlace o texto suelto). */
export function findFileUrls(markdown) {
  const { withoutCode } = prepareMarkdown(markdown);
  return withoutCode.flatMap((line, index) => (FILE_URL.test(line) ? [index + 1] : []));
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

/**
 * Archivos del repositorio (rutas POSIX relativas a `rootDir`): los versionados
 * que siguen en disco y los nuevos que `.gitignore` no excluye. Sin git, recorre
 * el árbol (sin `.git` ni `node_modules`).
 */
export function listRepositoryFiles(rootDir) {
  try {
    const output = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: rootDir,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return [...new Set(output.split('\0').filter(Boolean))].filter((file) =>
      fs.existsSync(path.join(rootDir, file))
    );
  } catch {
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '.git' || entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(fullPath);
        else files.push(toPosix(path.relative(rootDir, fullPath)));
      }
    };
    walk(rootDir);
    return files;
  }
}

/**
 * Carpetas de las skills de terceros que fija `skills-lock.json` (fuente y
 * `computedHash`). Su texto es el del repositorio de origen: editarlo rompe el
 * hash y la próxima actualización lo pisa, así que la guardia no las revisa.
 */
export function listVendoredSkillPrefixes(rootDir) {
  const lockPath = path.join(rootDir, 'skills-lock.json');
  if (!fs.existsSync(lockPath)) return [];
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  return Object.keys(lock.skills ?? {}).flatMap((name) => [`.agents/skills/${name}/`, `.claude/skills/${name}/`]);
}

/**
 * Revisa los Markdown de `rootDir` y devuelve los problemas encontrados.
 * `files` permite pasar la lista de archivos del repositorio (los tests la usan).
 */
export function findDocsLinkProblems(
  rootDir,
  { files = listRepositoryFiles(rootDir), skipPrefixes = listVendoredSkillPrefixes(rootDir) } = {}
) {
  const repoFiles = new Set(files.filter((file) => !file.split('/').includes('node_modules')));
  const repoDirs = new Set(['']);
  for (const file of repoFiles) {
    const parts = file.split('/');
    for (let depth = 1; depth < parts.length; depth += 1) repoDirs.add(parts.slice(0, depth).join('/'));
  }
  const allMarkdown = [...repoFiles].filter((file) => MARKDOWN_EXTENSION.test(file)).sort();
  const markdownFiles = allMarkdown.filter((file) => !skipPrefixes.some((prefix) => file.startsWith(prefix)));
  const skippedFiles = allMarkdown.length - markdownFiles.length;
  const contents = new Map();
  const read = (file) => {
    if (!contents.has(file)) contents.set(file, fs.readFileSync(path.join(rootDir, file), 'utf8'));
    return contents.get(file);
  };
  const anchorCache = new Map();
  const anchorsOf = (file) => {
    if (!anchorCache.has(file)) anchorCache.set(file, collectAnchors(read(file)));
    return anchorCache.get(file);
  };

  const problems = [];
  let checkedLinks = 0;
  for (const file of markdownFiles) {
    const markdown = read(file);
    for (const line of findFileUrls(markdown)) {
      problems.push({ file, line, message: 'enlace `file://`: usa una ruta relativa al archivo' });
    }

    for (const { target: rawTarget, line } of extractLinks(markdown)) {
      const target = rawTarget.trim();
      if (target === '' || target === '#' || target.startsWith('//') || FILE_URL.test(target)) continue;
      if (WINDOWS_ABSOLUTE_PATH.test(target)) {
        problems.push({ file, line, message: `ruta absoluta de Windows \`${target}\`: usa una ruta relativa` });
        continue;
      }
      if (URL_SCHEME.test(target)) continue;

      checkedLinks += 1;
      const hashIndex = target.indexOf('#');
      const beforeHash = hashIndex === -1 ? target : target.slice(0, hashIndex);
      const pathPart = beforeHash.replace(/\?.*$/, '');
      const query = beforeHash.slice(pathPart.length);
      const anchor = hashIndex === -1 ? '' : safeDecode(target.slice(hashIndex + 1));

      let resolved = file;
      if (pathPart !== '') {
        const decoded = safeDecode(pathPart);
        const joined = decoded.startsWith('/')
          ? path.posix.normalize(decoded.slice(1))
          : path.posix.normalize(path.posix.join(path.posix.dirname(file), decoded));
        resolved = joined.replace(/\/+$/, '');
        if (resolved === '.') resolved = '';
        if (resolved === '..' || resolved.startsWith('../')) {
          problems.push({ file, line, message: `\`${target}\` apunta fuera del repositorio` });
          continue;
        }
        if (!repoFiles.has(resolved) && !repoDirs.has(resolved)) {
          problems.push({ file, line, message: `\`${target}\` no existe en el repositorio` });
          continue;
        }
      }

      if (anchor === '' || !MARKDOWN_EXTENSION.test(resolved) || !repoFiles.has(resolved)) continue;
      // `archivo.md?plain=1#L10` es la vista de código de GitHub: el ancla es una línea, no un título.
      if (/[?&]plain=1(?:&|$)/.test(query) && LINE_ANCHOR.test(anchor)) continue;
      const anchors = anchorsOf(resolved);
      if (!anchors.has(anchor) && !anchors.has(anchor.toLowerCase())) {
        const where = resolved === file ? 'este archivo' : `\`${resolved}\``;
        problems.push({ file, line, message: `el ancla \`#${anchor}\` no existe en ${where}` });
      }
    }
  }
  return { problems, markdownFiles: markdownFiles.length, skippedFiles, checkedLinks };
}

function main() {
  const rootDir = process.cwd();
  const { problems, markdownFiles, skippedFiles, checkedLinks } = findDocsLinkProblems(rootDir);
  if (problems.length > 0) {
    console.error(`❌ Docs link guard: ${problems.length} enlace(s) rotos en los Markdown:`);
    for (const { file, line, message } of problems) console.error(`  - ${file}:${line}: ${message}`);
    process.exit(1);
  }
  console.log(
    `✅ Docs link guard passed (${markdownFiles} archivos Markdown, ${checkedLinks} enlaces relativos verificados; ` +
      `${skippedFiles} de skills de terceros fijadas en skills-lock.json sin revisar).`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
