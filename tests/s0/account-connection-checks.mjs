import { IndexedDbHandleRepository } from './folder-repository.js';
import { FolderConnectionSession } from './folder-session.js';

export async function runAccountConnectionChecks() {
  const checks = [];
  const check = async (name, action) => {
    await action();
    checks.push({ name, passed: true });
  };
  const expect = (value, message) => {
    if (!value) throw new Error(message);
  };
  const databaseName = `moa-account-check-${crypto.randomUUID()}`;
  const repo = new IndexedDbHandleRepository(databaseName);
  const root = await navigator.storage.getDirectory();
  const folderA = await root.getDirectoryHandle(`account-a-${crypto.randomUUID()}`, { create: true });
  const folderB = await root.getDirectoryHandle(`account-b-${crypto.randomUUID()}`, { create: true });
  const a = { userId: 'test:a', workspaceId: 'work' };
  const b = { userId: 'test', workspaceId: 'a:work' };

  await check('real IndexedDB clones and separates account/workspace/kind handles', async () => {
    await repo.write(a, 'source', folderA);
    await repo.write(b, 'source', folderB);
    await repo.write(a, 'ai-records', folderB);
    expect(await (await repo.read(a, 'source')).isSameEntry(folderA), 'A source lost');
    expect(await (await repo.read(b, 'source')).isSameEntry(folderB), 'structured keys collided');
    expect(await (await repo.read(a, 'ai-records')).isSameEntry(folderB), 'kind separation failed');
    expect(
      await repo.read({ ...a, workspaceId: 'different' }, 'source') === undefined,
      'workspace leaked'
    );
  });
  await check('a new repository instance restores references without auto-connecting a session', async () => {
    const fresh = new IndexedDbHandleRepository(databaseName);
    const session = new FolderConnectionSession(fresh);

    await session.switchOwner(a);
    expect(session.state('source') === 'needs-permission', 'preload activated source');
    expect(session.state('ai-records') === 'needs-permission', 'preload activated records');
    await session.switchOwner(null);
    expect(session.state('source') === 'disconnected', 'logout retained state');
  });
  await check('disconnect deletes only one reference and leaves the folder itself intact', async () => {
    const session = new FolderConnectionSession(repo);

    await session.switchOwner(a);
    await session.disconnect('source');
    expect(await repo.read(a, 'source') === undefined, 'A source reference remains');
    expect(await (await repo.read(a, 'ai-records')).isSameEntry(folderB), 'other kind removed');
    expect(await (await repo.read(b, 'source')).isSameEntry(folderB), 'other account removed');
    expect(
      await (await root.getDirectoryHandle(folderA.name)).isSameEntry(folderA),
      'original directory removed'
    );
  });
  await check('a pending save cannot resurrect a reference after a following disconnect', async () => {
    const secondRepo = new IndexedDbHandleRepository(databaseName);

    await Promise.all([repo.write(a, 'source', folderA), secondRepo.remove(a, 'source')]);
    expect(await repo.read(a, 'source') === undefined, 'late write revived reference');
  });

  return {
    boundary: 'real IndexedDB/OPFS/Web Locks, synthetic owners; no actual login or native permission prompts',
    checks
  };
}
