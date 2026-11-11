// Injected picker/permission responses exercise the probe's handlers; never claim native permission coverage.
export async function runProbeUiChecks() {
  const checks = [];
  const check = async (name, action) => {
    await action();
    checks.push({ name, passed: true });
  };
  const expect = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const output = () => JSON.parse(document.querySelector('#output').textContent);
  const click = async id => {
    const button = document.querySelector(`#${id}`);

    expect(!button.disabled, `Unexpected disabled control: ${id}`);
    await button.onclick();

    return output();
  };
  const root = await navigator.storage.getDirectory();
  const suite = await root.getDirectoryHandle(`probe-ui-${crypto.randomUUID()}`, { create: true });
  const source = await suite.getDirectoryHandle('source', { create: true });
  const destination = await suite.getDirectoryHandle('output', { create: true });
  const recoveryDestination = await suite.getDirectoryHandle('recovery', { create: true });
  const originalPicker = window.showDirectoryPicker;
  const originalPermission = FileSystemHandle.prototype.requestPermission;
  const requests = [];
  let permission = 'granted';

  FileSystemHandle.prototype.requestPermission = async function (options) {
    requests.push(options.mode);

    return permission;
  };

  const pick = handle => {
    window.showDirectoryPicker = async () => handle;
  };

  try {
    await check('source cancellation and failed scan retain the previous usable source connection', async () => {
      pick(source);
      expect((await click('source')).state === 'read-only inventory', 'source inventory failed');
      window.showDirectoryPicker = async () => {
        throw new DOMException('cancelled', 'AbortError');
      };
      expect(
        (await click('source')).state === 'selection-not-completed',
        'cancellation not distinguished'
      );
      pick({
        async *values() {
          throw new DOMException('lost read access', 'NotAllowedError');
        }
      });
      expect((await click('source')).state === 'failed', 'scan failure not surfaced');
      pick(destination);
      expect((await click('target')).state === 'saved-and-read-back', 'prior source was lost');
    });
    await check('target cancellation preserves saved connection; explicit restore requests read only', async () => {
      window.showDirectoryPicker = async () => {
        throw new DOMException('cancelled', 'AbortError');
      };

      const cancelled = await click('target');

      expect(cancelled.connectionRetained, 'target cancellation lost connection');
      expect((await click('restore')).state === 'restored', 'restore failed');
      expect(requests.at(-1) === 'read', 'restore requested write');
    });
    await check('injected permission denial preserves connection and allows explicit retry', async () => {
      permission = 'denied';

      const denied = await click('restore');

      expect(denied.name === 'NotAllowedError' && denied.connectionRetained, 'denied connection lost');
      permission = 'granted';
      expect((await click('restore')).state === 'restored', 'retry failed');
    });
    await check('interrupted save, preview, separate recovery, and reopen work through the probe controls', async () => {
      expect((await click('simulate')).state === 'interrupted-test-created', 'simulation failed');
      expect(requests.at(-1) === 'readwrite', 'simulation did not request write');
      expect((await click('recovery-preview')).state === 'recovery-preview', 'preview failed');
      expect(requests.at(-1) === 'read', 'preview requested write');
      pick(recoveryDestination);
      expect((await click('recover')).state === 'recovered-and-connected', 'recovery failed');
      expect((await click('restore')).revision === 'r1', 'recovered record failed to reopen');
      expect(document.querySelector('#recover').disabled, 'stale recovery action stayed enabled');
    });

    return { boundary: 'OPFS and probe handlers; picker and permissions injected, not native dialogs', checks };
  } finally {
    window.showDirectoryPicker = originalPicker;
    FileSystemHandle.prototype.requestPermission = originalPermission;
  }
}
