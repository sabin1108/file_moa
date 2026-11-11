// S0-only connection: not an authenticated or account-scoped product store.
export function createProbeConnection(store) {
  let handle;
  let ready = false;

  function validate(value) {
    if (value?.kind !== 'directory' || !/^(moa-s0-|recovered-)/.test(value.name)
      || typeof value.requestPermission !== 'function') {
      throw new Error('invalid-test-folder');
    }
  }

  return {
    get current() {
      return handle;
    },
    async initialize() {
      const restored = await store.load();

      if (restored) validate(restored);

      handle = restored;
      ready = true;
    },
    async commit(next) {
      validate(next);
      await store.save(next);
      handle = next;
      ready = true;
    },
    request(mode = 'read') {
      if (!ready) throw new Error('connection-not-ready');

      if (!handle) throw new Error('no-test-folder');

      if (mode !== 'read' && mode !== 'readwrite') throw new Error('invalid-permission-mode');

      const requested = handle;
      // Invoke before any await/IDB access, while still in the explicit click stack.

      return requested.requestPermission({ mode }).then(permission => {
        if (permission !== 'granted') throw new DOMException('폴더 권한이 필요합니다. 기존 연결은 유지됩니다.', 'NotAllowedError');

        return requested;
      });
    },
  };
}
