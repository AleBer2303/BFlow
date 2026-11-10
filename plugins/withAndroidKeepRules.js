/**
 * plugins/withAndroidKeepRules.js
 *
 * Config plugin de Expo (flujo CNG): añade las reglas keep de BFlow al
 * `android/app/proguard-rules.pro` que genera `expo prebuild`.
 *
 * Por qué existe: la plantilla nativa del SDK 58 compila el release con R8
 * (`android.enableMinifyInReleaseBuilds=true`) y R8 renombra todo método que ninguna regla
 * conserve. `expo-gl` busca `GLContext.flush()` por su nombre desde C++
 * (`EXGLJniApi.cpp`: `GetMethodID(GLContextClass, "flush", "()V")`) y no trae reglas de
 * consumidor, así que en el `.apk` esa búsqueda lanza `NoSuchMethodError` en el hilo de
 * JavaScript en cuanto un `GLView` recibe su superficie y la app se cierra. Expo Go no pasa
 * por R8, por eso allí no ocurre. Ver docs/decisions/0013-android-release-keep-rules.md.
 *
 * El directorio `android/` no está en git: sin este plugin la regla se perdería en cada build.
 */

const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const BLOCK_START = '# >>> BFlow keep rules (plugins/withAndroidKeepRules.js)';
const BLOCK_END = '# <<< BFlow keep rules';

const KEEP_RULES = [
  '# expo-gl: su capa C++ llama a GLContext.flush() por nombre mediante JNI y el paquete no',
  '# publica reglas de consumidor. Sin esta regla R8 lo renombra y la app se cierra al montar',
  '# el primer GLView (la curva del Resumen, justo despues de iniciar sesion).',
  '-keep class expo.modules.gl.** { *; }',
];

const PROGUARD_RULES_PATH = path.join('app', 'proguard-rules.pro');

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Devuelve el contenido de `proguard-rules.pro` con el bloque de BFlow al final.
 * Es idempotente: un bloque anterior (de otro prebuild o de otra version) se sustituye.
 */
function mergeKeepRules(contents) {
  const previousBlock = new RegExp(
    `\\n*${escapeRegExp(BLOCK_START)}[\\s\\S]*?${escapeRegExp(BLOCK_END)}\\n?`,
    'g'
  );
  const base = String(contents ?? '')
    .replace(/\r\n/g, '\n')
    .replace(previousBlock, '\n')
    .trimEnd();
  const block = [BLOCK_START, ...KEEP_RULES, BLOCK_END].join('\n');
  return `${base === '' ? '' : `${base}\n\n`}${block}\n`;
}

/** @param {string} platformProjectRoot ruta del proyecto nativo generado (`android/`). */
function applyKeepRules(platformProjectRoot) {
  const filePath = path.join(platformProjectRoot, PROGUARD_RULES_PATH);
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, mergeKeepRules(current), 'utf8');
  return filePath;
}

function withAndroidKeepRules(config) {
  return withDangerousMod(config, [
    'android',
    (modConfig) => {
      applyKeepRules(modConfig.modRequest.platformProjectRoot);
      return modConfig;
    },
  ]);
}

module.exports = withAndroidKeepRules;
module.exports.mergeKeepRules = mergeKeepRules;
module.exports.applyKeepRules = applyKeepRules;
module.exports.KEEP_RULES = KEEP_RULES;
module.exports.BLOCK_START = BLOCK_START;
module.exports.BLOCK_END = BLOCK_END;
