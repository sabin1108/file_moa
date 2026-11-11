import { readdir, lstat, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { createHash } from 'node:crypto';

// Read-only, bounded inspection. No filenames, contents, paths or per-file hashes enter the report.

const root = process.argv[2];

if (!root) throw new Error('Usage: node tests/s0/inspect-source.mjs <explicitly-authorized-folder>');

const queue = [resolve(root)], candidates = [], counts = {};
let directories = 0, skipped = 0, files = 0;

while (queue.length) {
  const directory = queue.shift();
  const entries = await readdir(directory, { withFileTypes: true });

  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) {
      skipped++;

      continue;
    }

    const path = join(directory, entry.name);
    const stat = await lstat(path);

    if (stat.isSymbolicLink()) {
      skipped++;

      continue;
    }

    if (stat.isDirectory()) {
      queue.push(path);
      directories++;
    }
    else if (stat.isFile()) {
      files++;

      const extension = extname(entry.name).toLowerCase() || '(none)';
      const group = counts[extension] ??= { count: 0, bytes: 0, maxBytes: 0 };

      group.count++;
      group.bytes += stat.size;
      group.maxBytes = Math.max(group.maxBytes, stat.size);

      if (['.md', '.txt'].includes(extension) && stat.size <= 2097152 && candidates.length < 3) candidates.push(path);
    }

    if (files > 5000 || directories > 1000) throw new Error('Read-only inspection limit reached');
  }
}

let utf8Valid = 0, stableReads = 0;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

for (const path of candidates) {
  const before = await readFile(path);

  try {
    new TextDecoder('utf-8', { fatal: true }).decode(before);
    utf8Valid++;
  } catch { /* aggregate only */ }

  const after = await readFile(path);

  if (hash(before) === hash(after)) stableReads++;
}

const report = {
  inspectedAt: new Date().toISOString(),
  scope: 'User-authorized note directory; hidden entries and links excluded',
  directories,
  files,
  skipped,
  counts,
  sample: { count: candidates.length, utf8Valid, stableReads, contentExported: false },
  limitations: 'Metadata inventory plus at most three bounded UTF-8/hash reads. No browser permission test, PDF parsing or source writes.'
};

await mkdir('docs/verification/s0', { recursive: true });
await writeFile('docs/verification/s0/source-inventory.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
