import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

// Synthetic only; never copies personal files. PDF is a parser fixture, not a rendered product artifact.
const root = resolve('.taste-skill/s0-fixtures');
await mkdir(join(root, 'source-a'), { recursive: true });
await mkdir(join(root, 'source-b'), { recursive: true });
await mkdir(join(root, 'ai-output'), { recursive: true });
await writeFile(join(root, 'source-a', '프로젝트.md'), '# 합성 프로젝트\n담당: 화면 구현\n검증 결과: 완료\n');
await writeFile(join(root, 'source-b', '회의.txt'), '합성 회의 기록\n다음 작업은 자료 검토입니다.\n');
await writeFile(join(root, 'source-b', 'empty.txt'), '');
await writeFile(join(root, 'source-b', 'invalid-utf8.txt'), Buffer.from([0xc3, 0x28]));
const stream = 'BT /F1 12 Tf 50 780 Td (S0 synthetic report. No personal data.) Tj ET\n';
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
];
let pdf = '%PDF-1.4\n';
const offsets = [0];
for (const [index, object] of objects.entries()) {
  offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
}
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
await writeFile(join(root, 'source-a', 'synthetic-report.pdf'), pdf);
console.log('Created 5 synthetic source files and an empty AI-output directory under .taste-skill/s0-fixtures. PDF extraction is not implemented or tested by this generator.');
