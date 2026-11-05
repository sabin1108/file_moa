import { describe, expect, it } from 'vitest';
import { inspectSourceDirectory } from './source-inventory.mjs';
const dir = (name, entries = []) => ({ name, kind: 'directory', async *values() { yield* entries; } });
const file = name => ({ name, kind: 'file' });
describe('S0 bounded source inventory', () => {
  it('counts names only and skips hidden folders without traversing them', async () => {
    const hidden = dir('.private'); hidden.values = () => { throw new Error('must not read'); };
    expect(await inspectSourceDirectory(dir('root', [file('한글.MD'), file('two.txt'), file('a.pdf'), hidden, dir('sub', [file('empty.txt')])]))).toEqual({ files: 4, md: 1, txt: 2, pdf: 1, skipped: 1, directories: 2 });
  });
  it('rejects incomplete traversal instead of presenting partial success', async () => {
    const bad = dir('bad'); bad.values = () => { throw new DOMException('revoked', 'NotAllowedError'); };
    await expect(inspectSourceDirectory(dir('root', [file('a.md'), bad]))).rejects.toMatchObject({ name: 'NotAllowedError' });
  });
  it('counts total visited directories, including a deep single-child chain', async () => {
    let tree = dir('last'); for (let i = 0; i < 500; i++) tree = dir(`d${i}`, [tree]);
    await expect(inspectSourceDirectory(tree)).rejects.toThrow('source-directory-limit');
  });
  it('accepts exactly 5000 files and refuses 5001', async () => {
    const entries = Array.from({ length: 5000 }, (_, i) => file(`${i}.txt`));
    expect((await inspectSourceDirectory(dir('root', entries))).files).toBe(5000);
    await expect(inspectSourceDirectory(dir('root', [...entries, file('overflow.txt')]))).rejects.toThrow('source-file-limit');
  });
});
