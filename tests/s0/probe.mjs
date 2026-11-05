import { saveRevision, loadLatest } from './record-store.js';
import { keepHandle, restoreHandle } from './handle-store.mjs';
import { previewRecovery, recoverRecord } from './record-recovery.js';
import { createProbeConnection } from './probe-connection.mjs';
import { inspectSourceDirectory } from './source-inventory.mjs';

const output = document.querySelector('#output');
let sourceHandle;
let recovery;
const connection = createProbeConnection({ load: restoreHandle, save: keepHandle });
const supported = typeof window.showDirectoryPicker === 'function';
const show = value => { output.textContent = JSON.stringify(value, null, 2); };
async function run(action) {
  const buttons = [...document.querySelectorAll('button')]; buttons.forEach(button => { button.disabled = true; });
  try { await action(); } catch (error) {
    show({ state: error.name === 'AbortError' ? 'selection-not-completed' : 'failed', name: error.name, message: error.message, connectionRetained: !!connection.current });
  } finally {
    buttons.forEach(button => { button.disabled = !supported; });
    for (const id of ['restore', 'simulate', 'recovery-preview']) document.querySelector(`#${id}`).disabled = !supported || !connection.current;
    document.querySelector('#recover').disabled = !supported || !recovery;
  }
}
async function separateFromSource(folder) {
  if (!sourceHandle) throw new Error('먼저 자료 폴더를 읽기 전용으로 확인하세요.');
  if (await sourceHandle.isSameEntry(folder) || await sourceHandle.resolve(folder) !== null || await folder.resolve(sourceHandle) !== null) throw new Error('자료 폴더와 겹치지 않는 별도 테스트 폴더를 선택하세요.');
}

document.querySelector('#source').onclick = () => run(async () => {
  const candidate = await window.showDirectoryPicker({ mode: 'read' });
  const inventory = await inspectSourceDirectory(candidate);
  sourceHandle = candidate;
  recovery = null;
  show({ state: 'read-only inventory', ...inventory, contentRead: false });
});
document.querySelector('#target').onclick = () => run(async () => {
  if (!sourceHandle) throw new Error('먼저 자료 폴더를 읽기 전용으로 확인하세요.');
  const root = await window.showDirectoryPicker({ mode: 'readwrite' });
  await separateFromSource(root);
  const directory = await root.getDirectoryHandle(`moa-s0-${crypto.randomUUID()}`, { create: true });
  const saved = await saveRevision(directory, {
    recordId: 's0-record', revisionId: 'r1', parentRevisionId: null, kind: 'artifact',
    scope: { type: 'project', id: 's0-project' }, state: 'draft', createdAt: new Date().toISOString(),
  }, '# 저장 검증\n개인정보 없는 합성 문서입니다.');
  await connection.commit(directory);
  recovery = null;
  show({ state: 'saved-and-read-back', revision: saved.metadata.revisionId, directory: directory.name });
});
document.querySelector('#restore').onclick = () => run(async () => {
  const handle = await connection.request('read');
  const latest = await loadLatest(handle, 's0-record');
  if (!latest) throw new Error('no-record-in-test-folder');
  show({ state: 'restored', revision: latest.metadata.revisionId });
});
document.querySelector('#simulate').onclick = () => run(async () => {
  if (!sourceHandle) throw new Error('먼저 자료 폴더를 읽기 전용으로 확인하세요.');
  const handle = await connection.request('readwrite');
  await separateFromSource(handle);
  const revision = `interrupted-${crypto.randomUUID()}`;
  const body = await handle.getFileHandle(`${revision}.md`, { create: true });
  const stream = await body.createWritable({ mode: 'exclusive' });
  await stream.write('합성 저장 중단 예시. 정상 기록은 별도로 남습니다.'); await stream.close();
  await handle.getFileHandle(`${revision}.json`, { create: true });
  recovery = null;
  show({ state: 'interrupted-test-created', next: '복구할 정상 버전 확인을 누르세요.' });
});
document.querySelector('#recovery-preview').onclick = () => run(async () => {
  recovery = null;
  const handle = await connection.request('read');
  const preview = await previewRecovery(handle, 's0-record');
  recovery = { handle, preview };
  show({ state: 'recovery-preview', ...preview, action: '정상 이력을 새 폴더에 복사합니다. 기존 파일은 보존합니다.' });
});
document.querySelector('#recover').onclick = () => run(async () => {
  if (!recovery) throw new Error('먼저 복구할 버전을 확인하세요.');
  if (!sourceHandle) throw new Error('먼저 자료 폴더를 읽기 전용으로 확인하세요.');
  const destination = await window.showDirectoryPicker({ mode: 'readwrite' });
  await separateFromSource(destination);
  const result = await recoverRecord(recovery.handle, destination, 's0-record', recovery.preview.fingerprint);
  await connection.commit(result.directory);
  recovery = null;
  show({ state: 'recovered-and-connected', directory: result.directory.name, revision: result.preview.headRevisionId });
});

await run(async () => {
  if (!supported) { show({ state: 'unsupported', message: '이 환경에서는 로컬 폴더 선택을 지원하지 않습니다.' }); return; }
  await connection.initialize();
  show({ state: connection.current ? 'reconnect-needed' : 'ready', message: connection.current ? '저장 폴더 연결 복원을 눌러 읽기 권한을 확인하세요.' : '자료 폴더를 읽기 전용으로 선택하세요.' });
});
