#!/usr/bin/env node
// Ejecuta las pruebas del studio y decide si el resultado es aceptable.
//
// `npm run test:studio` sale siempre con codigo 1: hay cuatro pruebas que
// fallaban antes de que existiera el CI y que no se van a arreglar sin
// decidirlo (docs/decisiones/0005, seccion Estado). Un CI que ejecutara el
// comando a pelo estaria en rojo desde el primer dia, y un rojo permanente
// no lo mira nadie.
//
// Asi que la regla es esta: falla si aparece un fallo NUEVO, y falla tambien
// si uno de los conocidos deja de fallar. Lo segundo no es celo: una lista de
// excepciones que nadie poda acaba tapando una prueba que volvio a romperse.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const lista = JSON.parse(readFileSync(join(raiz, 'scripts/fallos-conocidos.json'), 'utf8'));
const conocidos = new Map(lista.fallos.map((f) => [f.prueba, f.motivo]));

// shell: true porque en Windows npm es un .cmd y Node se niega a lanzarlo
// directamente desde la 18.20. El comando no lleva nada del exterior.
const ejecucion = spawnSync('npm run --silent test:studio', {
  cwd: join(raiz, 'frontend'),
  encoding: 'utf8',
  shell: true,
  maxBuffer: 64 * 1024 * 1024,
});

if (ejecucion.error) {
  console.error('No se ha podido ejecutar npm run test:studio: ' + ejecucion.error.message);
  process.exit(2);
}

const salida = (ejecucion.stdout || '') + (ejecucion.stderr || '');
process.stdout.write(salida);

// El formato es TAP plano: una linea por prueba, sin anidar.
const pasan = new Set();
const fallan = new Set();
for (const linea of salida.split(/\r?\n/)) {
  const m = /^(not ok|ok) \d+ - (.*)$/.exec(linea);
  if (m) (m[1] === 'ok' ? pasan : fallan).add(m[2].trim());
}

// Contraste contra el propio resumen de node --test. Si el parseo se
// desalinea del recuento, lo que sigue seria una lectura inventada.
const resumen = /^# fail (\d+)$/m.exec(salida);
const total = /^# tests (\d+)$/m.exec(salida);
const problemas = [];

if (!resumen || !total) {
  problemas.push('La salida no trae el resumen de node --test. No se puede afirmar nada sobre las pruebas.');
} else {
  if (Number(resumen[1]) !== fallan.size)
    problemas.push(`El resumen dice ${resumen[1]} fallos y se han leido ${fallan.size}. El parseo no cuadra.`);
  if (Number(total[1]) !== pasan.size + fallan.size)
    problemas.push(`El resumen dice ${total[1]} pruebas y se han leido ${pasan.size + fallan.size}.`);
}

const nuevos = [...fallan].filter((n) => !conocidos.has(n));
const arreglados = [...conocidos.keys()].filter((n) => pasan.has(n));
const ausentes = [...conocidos.keys()].filter((n) => !pasan.has(n) && !fallan.has(n));

console.log('\n--- Pruebas del studio ---');
console.log(`Pasan ${pasan.size} · fallan ${fallan.size} · conocidos ${conocidos.size}`);

for (const n of nuevos) problemas.push(`Fallo NUEVO: ${n}`);
for (const n of arreglados)
  problemas.push(`Ya no falla y sigue en la lista: ${n} — quitala de scripts/fallos-conocidos.json`);
for (const n of ausentes)
  problemas.push(`En la lista pero no se ha ejecutado: ${n} — se ha renombrado o borrado`);

if (problemas.length) {
  console.log('');
  for (const p of problemas) console.log('ERROR: ' + p);
  process.exit(1);
}

for (const [n, motivo] of conocidos) console.log(`  conocido · ${n}\n      ${motivo}`);
console.log('\nSin fallos nuevos.');
