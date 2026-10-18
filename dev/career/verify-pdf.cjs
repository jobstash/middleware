// Synthetic export verification; never writes candidate data.
require('ts-node').register({ transpileOnly: true });
const { mkdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const { renderCareerPdf } = require('../../src/career-agent/career-pdf');
(async () => {
  const dir = join(__dirname, '.local/pdf-proof');
  await mkdir(dir, { recursive: true });
  const paragraphs = Array.from({ length: 35 }, (_, i) => `Evidence ${i + 1}: Local synthetic export test\nSoftware Engineer · Example Project ${i + 1}\n2024-01-01 - 2025-01-01\nBuilt TypeScript services backed by PostgreSQL, reviewed changes with colleagues and documented operational procedures. This is synthetic content used only to verify line wrapping, page breaks and selectable text in the Career Agent renderer.`);
  const path = join(dir, 'multipage-cv.pdf');
  await writeFile(path, await renderCareerPdf('Synthetic export verification', paragraphs));
  execFileSync('pdftotext', ['-layout', path, join(dir, 'multipage-cv.txt')]);
  const text = require('node:fs').readFileSync(join(dir, 'multipage-cv.txt'), 'utf8');
  const ids = [...text.matchAll(/Evidence (\d+):/g)].map(m => Number(m[1]));
  if (ids.length !== 35 || ids.some((id, i) => id !== i + 1)) throw Error('Export lost or reordered evidence');
  execFileSync('pdftoppm', ['-scale-to', '1000', '-png', path, join(dir, 'multipage-cv')]);
  console.log(execFileSync('pdfinfo', [path], { encoding: 'utf8' }));
  console.log('All 35 evidence paragraphs survive selectable-text extraction. Inspect the rendered pages.');
})();
