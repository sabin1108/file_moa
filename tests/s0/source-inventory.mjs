export async function inspectSourceDirectory(root) {
  const result = { files: 0, md: 0, txt: 0, pdf: 0, skipped: 0, directories: 1 };
  const queue = [root];
  for (let index = 0; index < queue.length; index++) {
    for await (const entry of queue[index].values()) {
      if (entry.name.startsWith('.')) { result.skipped++; continue; }
      if (entry.kind === 'directory') {
        if (++result.directories > 500) throw new Error('source-directory-limit');
        queue.push(entry);
      } else {
        if (++result.files > 5000) throw new Error('source-file-limit');
        const extension = entry.name.split('.').pop().toLowerCase();
        if (['md', 'txt', 'pdf'].includes(extension)) result[extension]++;
      }
    }
  }
  return result;
}
