#!/usr/bin/env node
// Sella la revision de un informe de impacto contra el HEAD que hay ahora
// mismo en el arbol, y escribe una copia. El original no se toca.
//
// POR QUE HACE FALTA. El guard exige que `revision` sea igual a HEAD. Un
// informe se escribe antes de commitear el cambio que describe, asi que no
// puede llevar dentro el hash del commit que va a crearse con el dentro. En
// local eso se resuelve volviendo a sellar a mano; en CI no hay nadie.
//
// QUE SE PIERDE AL HACERLO. La revision deja de ser una atadura: un informe
// viejo tambien pasaria ese control. Lo que sigue protegiendo es el resto
// del guard, que exige una fila por cada archivo cambiado — un informe rancio
// se cae en cuanto el cambio toca un archivo que no figura en el. Dicho de
// otro modo: el CI comprueba que el informe CUBRE el cambio, no que se
// escribiera para el.
//
// Lo que este script NO hace, y es deliberado: no toca `result`, ni
// `evidence`, ni las clasificaciones. Marcar pruebas como pasadas desde la
// tuberia convertiria el informe en un adorno.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const [entrada, salida] = process.argv.slice(2);
if (!entrada || !salida) {
  console.error('Uso: node scripts/sellar-revision.mjs <informe.json> <destino.json>');
  process.exit(2);
}

const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const raiz = resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());

// El guard rechaza cualquier ruta fuera del repositorio con
// "Path outside repository", asi que la copia NO puede vivir en el temporal
// del ejecutor. Costo un intento; que lo diga aqui y no alli.
const fuera = relative(raiz, resolve(salida));
if (fuera.startsWith('..')) {
  console.error('ERROR: el destino cae fuera del repositorio: ' + salida);
  console.error('El guard solo acepta rutas dentro del arbol. Usa algo como');
  console.error('  .specanchor/evidence/impact-review.sellado.json');
  process.exit(2);
}
const informe = JSON.parse(readFileSync(entrada, 'utf8'));
const antes = informe.revision;

const intocables = ['files', 'traceability', 'task_spec'];
for (const clave of intocables) {
  if (!(clave in informe) && clave !== 'traceability') {
    console.error(`ERROR: el informe no trae "${clave}".`);
    process.exit(2);
  }
}

informe.revision = head;
mkdirSync(dirname(salida), { recursive: true });
writeFileSync(salida, JSON.stringify(informe, null, 2) + '\n', 'utf8');

console.log(`Informe: ${entrada}`);
console.log(`  revision escrita: ${antes}`);
console.log(`  revision sellada: ${head}`);
console.log(`  filas: ${(informe.files || []).length} · trazas: ${(informe.traceability || []).length}`);
console.log(`  copia en: ${salida}`);
