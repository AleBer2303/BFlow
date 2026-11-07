Quiero mejorar el rendimiento de esta aplicación con evidencia, no con suposiciones. Basados en la guía de optimizacion y mejoras de rendimiento "Guia_31_Mejoras_Rendimiento_App.pdf".

REGLAS
- Trabaja en una rama nueva. No toques la main, secretos ni datos reales.
- No elimines archivos o datos sin autorización.
- No modifiques código hasta que apruebe tu diagnóstico.
- Si el framework o hosting ya resuelve algo, verifica y no lo dupliques.
- Un cambio por commit; ejecuta tests, mide y revierte si falla.
- Si una métrica no está disponible, decláralo; no inventes resultados.

FASE 1 / MEDIR (SOLO LECTURA)
1. Detecta framework, base de datos, librerías y versiones.
2. Analiza las 3 rutas más importantes con Lighthouse móvil, si está disponible.
3. Recoge LCP, INP y CLS de usuarios reales al p75 si existe esa información.
4. Registra tamaño inicial de JS y consultas más lentas/repetidas si hay acceso.
5. Guarda la línea base en PERF_BASELINE.md con entorno y metodología.

FASE 2 / DIAGNOSTICAR
Audita estos 31 puntos de la guía del documento "Guia_31_Mejoras_Rendimiento_App.pdf":
01 Skeletons; 02 imágenes modernas; 03 API sin duplicados;
04 debounce; 05 paginación; 06 CDN; 07 colas;
08 N+1; 09 compresión; 10 caché/TTL; 11 dependencias;
12 timeouts; 13 streaming IA; 14 interfaz optimista;
15 lazy loading; 16 paralelismo; 17 índices; 18 trazas;
19 misma región; 20 SSR/SSG; 21 scripts terceros;
22 code splitting; 23 virtualización; 24 columnas necesarias;
25 pool de conexiones; 26 re-renders; 27 caché navegador;
28 balanceo; 29 fuentes locales; 30 métricas reales;
31 móvil de gama baja y red lenta.
Para cada punto: estado (ya está / falta / no aplica), evidencia
(archivo:línea, configuración o medición), impacto, esfuerzo y riesgo.
Ordena propuestas por impacto/ esfuerzo y muestra el diagnóstico.
ESPERA mi aprobación para empezar cambios.

FASE 3 / IMPLEMENTAR SOLO CON APROBACIÓN
- Aplica una mejora por commit, documentando motivo y cambios.
- Ejecuta tests y vuelve a medir la dimensión afectada.
- Si empeora o rompe funcionalidad, revierte el cambio.
- Rellena el informe final con antes, después y descartes.
- No afirmes mejoras sin datos comparables.