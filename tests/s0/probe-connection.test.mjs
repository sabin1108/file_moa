import { describe, expect, it, vi } from 'vitest';
import { createProbeConnection } from './probe-connection.mjs';

const folder = (name = 'moa-s0-old') => ({ name, kind: 'directory', requestPermission: vi.fn().mockResolvedValue('granted') });
const storeFor = handle => ({ load: vi.fn().mockResolvedValue(handle), save: vi.fn().mockResolvedValue(undefined) });

describe('S0 explicit reconnection', () => {
  it('preloads without requesting permission and refuses actions until ready', async () => {
    const handle = folder();
    const store = storeFor(handle);
    const connection = createProbeConnection(store);

    expect(() => connection.request('read')).toThrow('connection-not-ready');
    await connection.initialize();
    expect(handle.requestPermission).not.toHaveBeenCalled();
    expect(connection.current).toBe(handle);
  });
  it('calls permission synchronously in the click stack without another storage read', async () => {
    const handle = folder();
    const store = storeFor(handle);
    const connection = createProbeConnection(store);

    await connection.initialize();

    const pending = connection.request('read');

    expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'read' });
    expect(store.load).toHaveBeenCalledTimes(1);
    expect(await pending).toBe(handle);
  });
  it('requests write permission only for explicit writes', async () => {
    const handle = folder();
    const connection = createProbeConnection(storeFor(handle));

    await connection.initialize();
    await connection.request('readwrite');
    expect(handle.requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(() => connection.request('invalid')).toThrow('invalid-permission-mode');
  });
  it('retains a denied handle and permits a later explicit retry', async () => {
    const handle = folder();

    handle.requestPermission.mockResolvedValueOnce('denied');

    const connection = createProbeConnection(storeFor(handle));

    await connection.initialize();
    await expect(connection.request('read')).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(connection.current).toBe(handle);
    await expect(connection.request('read')).resolves.toBe(handle);
  });
  it('retains the old connection when persistence of the new connection fails', async () => {
    const old = folder();
    const store = storeFor(old);
    const connection = createProbeConnection(store);

    await connection.initialize();
    store.save.mockRejectedValueOnce(new Error('disk failure'));
    await expect(connection.commit(folder('recovered-new'))).rejects.toThrow('disk failure');
    expect(connection.current).toBe(old);
  });
  it('activates the new folder only after persistence completes', async () => {
    const old = folder();
    const next = folder('recovered-new');
    let finish;
    const store = storeFor(old);

    store.save.mockImplementation(() => new Promise(resolve => {
      finish = resolve;
    }));

    const connection = createProbeConnection(store);

    await connection.initialize();

    const pending = connection.commit(next);

    expect(connection.current).toBe(old);
    finish();
    await pending;
    expect(connection.current).toBe(next);
  });
  it('refuses missing, non-test, or non-directory handles', async () => {
    for (const value of [undefined, folder('private-docs'), { ...folder(), kind: 'file' }]) {
      const connection = createProbeConnection(storeFor(value));

      if (value) await expect(connection.initialize()).rejects.toThrow('invalid-test-folder'); else await connection.initialize();

      expect(() => connection.request('read')).toThrow();
    }
  });
  it('keeps initialization failure explicit instead of treating it as no connection', async () => {
    const store = storeFor(undefined);

    store.load.mockRejectedValue(new Error('idb unavailable'));

    const connection = createProbeConnection(store);

    await expect(connection.initialize()).rejects.toThrow('idb unavailable');
    expect(() => connection.request('read')).toThrow('connection-not-ready');
  });
});
