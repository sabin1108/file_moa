// Serialized into an isolated browser profile by the UI check. Never shipped in product bundles.
export function installFolderBrowserFixture() {
  const p = window.listingProbe = {
    name: '검증 자료 A',
    permission: 'granted',
    pickerMode: 'success',
    failRead: '',
    holdRead: false,
    holds: [],
    scans: 0,
    permissionRequests: 0,
    requestsActive: [],
    queries: 0,
    productWrites: 0,
    productBodyReads: 0,
    preparing: false,
    failRemove: false,
    failWrite: false,
    reads: 0,
  };
  const values = FileSystemDirectoryHandle.prototype.values;
  const getDirectory = FileSystemDirectoryHandle.prototype.getDirectoryHandle;
  const getFile = FileSystemFileHandle.prototype.getFile;
  const writable = FileSystemFileHandle.prototype.createWritable;

  FileSystemDirectoryHandle.prototype.values = async function* () {
    p.scans++;

    const failure = p.failRead;

    p.failRead = '';

    if (p.holdRead) await new Promise(resolve => p.holds.push(resolve));

    if (failure) throw new DOMException('synthetic listing failure', failure);

    yield* values.call(this);
  };
  FileSystemDirectoryHandle.prototype.getDirectoryHandle = function (name, options) {
    if (options?.create && !p.preparing) p.productWrites++;

    return getDirectory.call(this, name, options);
  };
  FileSystemFileHandle.prototype.getFile = function () {
    if (!p.preparing) p.productBodyReads++;

    return getFile.call(this);
  };
  FileSystemFileHandle.prototype.createWritable = function (...args) {
    if (!p.preparing) p.productWrites++;

    return writable.apply(this, args);
  };
  FileSystemHandle.prototype.queryPermission = async function () {
    p.queries++;

    return p.permission;
  };
  FileSystemHandle.prototype.requestPermission = async function () {
    p.permissionRequests++;
    p.requestsActive.push(navigator.userActivation.isActive);

    return p.permission;
  };

  const remove = IDBObjectStore.prototype.delete;
  const put = IDBObjectStore.prototype.put;
  const get = IDBObjectStore.prototype.get;

  IDBObjectStore.prototype.delete = function (...args) {
    if (this.name === 'connections' && p.failRemove) throw new Error('synthetic removal failure');

    return remove.apply(this, args);
  };
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === 'connections' && p.failWrite) throw new DOMException('synthetic quota', 'QuotaExceededError');

    return put.apply(this, args);
  };
  IDBObjectStore.prototype.get = function (...args) {
    if (this.name === 'connections') p.reads++;

    return get.apply(this, args);
  };

  p.prepare = async () => {
    p.preparing = true;

    try {
      const origin = await navigator.storage.getDirectory();

      p.a = await origin.getDirectoryHandle('검증 자료 A', { create: true });
      p.b = await origin.getDirectoryHandle('검증 자료 B', { create: true });

      const child = await p.a.getDirectoryHandle('하위 자료', { create: true });

      await p.a.getDirectoryHandle('빈 폴더', { create: true });

      const names = ['읽기 안내.md', '할 일.txt', '회의 메모.md', '지원하지 않는 사진.pdf', '공백 있는 이름.txt', '긴 파일 이름을 확인하는 자료 '.repeat(7) + '.md'];

      for (const name of names) {
        const handle = await p.a.getFileHandle(name, { create: true });
        const stream = await handle.createWritable();

        await stream.write(`# ${name}\n개인정보 없는 합성 원문`);
        await stream.close();
      }

      const nested = await child.getFileHandle('하위 문서.txt', { create: true });
      const stream = await nested.createWritable();

      await stream.write('하위 폴더의 합성 원문');
      await stream.close();

      const sentinel = await p.a.getFileHandle('읽기 안내.md');

      p.sentinel = async () => {
        p.preparing = true;

        try {
          const file = await sentinel.getFile();
          const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))];

          return { name: sentinel.name, size: file.size, mtime: file.lastModified, hash };
        } finally {
          p.preparing = false;
        }
      };
      p.before = await p.sentinel();
    } finally {
      p.preparing = false;
    }
  };
  window.showDirectoryPicker = async () => {
    if (p.pickerMode === 'cancel') throw new DOMException('synthetic picker cancellation', 'AbortError');

    if (!p.a) await p.prepare();

    return p.name === '검증 자료 A' ? p.a : p.b;
  };
}
