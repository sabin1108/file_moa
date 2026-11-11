import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';
import { revealSelectionControl } from '../fixtures/reveal-file-tools.mjs';
import { choosePlanDestination } from '../fixtures/choose-plan-destination.mjs';
import { wait, click } from '../fixtures/browser-actions.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3014';
const out = process.argv[3] || 'docs/verification/recovery-restore/browser';

mkdirSync(out, { recursive: true });

const browser = await Browser.launch({ extraArgs: ['--no-sandbox', '--disable-gpu'] });
const checks = [];
let page;

function check(name, passed, detail) {
  checks.push({ name, passed, detail });
  assert.ok(passed, name);
}

try {
  page = await browser.newPage({ width: 1440, height: 900 });
  await page.send(
    'Page.addScriptToEvaluateOnNewDocument',
    { source: `(${installFolderBrowserFixture.toString()})();` }
  );
  await page.goto(base + '/files', { settleMs: 350 });
  await click(page, '폴더 연결 관리');
  await wait(
    page,
    () => [...document.querySelectorAll('button')].some(el => el.textContent === '폴더 연결' && !el.disabled)
  );
  check(
    'app permission guide is visible without triggering a picker or permission request',
    await page.eval(() => !!document.querySelector('[aria-label="폴더 접근 안내"]') && listingProbe.permissionRequests === 0)
  );
  await page.eval(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.eval(() => Promise.all(document.querySelector('dialog:modal').getAnimations().map(animation => animation.finished)));

  for (const width of [390, 1440]) {
    await page.setViewport({ width, height: 900 });
    await page.screenshot({ path: `${out}/permission-guide-${width}.png`, format: 'png' });
    check(
      `permission guide contained ${width}`,
      await page.eval(() => document.querySelector('dialog:modal').scrollWidth <= document.querySelector('dialog:modal').clientWidth)
    );
  }

  await click(page, '폴더 연결');
  await wait(page, () => document.querySelector('[data-listing-phase]')?.dataset.listingPhase === 'ready');
  await page.eval(() => {
    listingProbe.name = '검증 자료 A';
  });
  await click(page, '새 보관함 만들기');
  await click(page, '만들 위치 선택');
  await wait(page, () => document.body.textContent.includes('생성 위치: 검증 자료 A'));
  await wait(
    page,
    () => [...document.querySelectorAll('button')].some(el => el.checkVisibility() && !el.disabled && el.textContent.trim() === '이 위치에 보관함 생성')
  );
  await click(page, '이 위치에 보관함 생성');
  await wait(page, () => document.body.textContent.includes('위치·식별 확인됨'));
  await click(page, '복구 보관함 보기');
  await wait(page, () => document.querySelector('[data-archive-phase]')?.dataset.archivePhase === 'ready');
  check(
    'empty connected vault is shown honestly inside settings',
    await page.eval(() => document.querySelector('[data-archive-phase]').textContent.includes('아직 보관된 복구 사본이 없습니다'))
  );
  await page.send(
    'Input.dispatchKeyEvent',
    { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }
  );
  await page.send(
    'Input.dispatchKeyEvent',
    { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }
  );
  check(
    'nested archive Escape retains settings and restores its trigger',
    await page.eval(() => document.querySelectorAll('dialog:modal').length === 1 && document.activeElement.textContent === '복구 보관함 보기')
  );
  await click(page, '폴더 연결 관리 닫기');
  await page.eval(async () => {
    listingProbe.preparing = true;

    try {
      const parent = await listingProbe.a.getDirectoryHandle('하위 자료');
      const target = await parent.getFileHandle('읽기 안내.md', { create: true });
      const stream = await target.createWritable();

      await stream.write('r'.repeat(16 * 1024 * 1024));
      await stream.close();
      listingProbe.targetSnapshot = async () => {
        const file = await target.getFile();

        return { size: file.size, mtime: file.lastModified, body: await file.text() };
      };
      listingProbe.targetBefore = await listingProbe.targetSnapshot();
      listingProbe.productWrites = 0;
    } finally {
      listingProbe.preparing = false;
    }
  });
  await revealSelectionControl(page, '읽기 안내.md 선택');
  await click(page, '복사');
  await choosePlanDestination(page, label => click(page, label), '하위 자료');
  await click(page, '계획 만들기');
  await wait(page, () => document.querySelector('[data-plan-phase]')?.dataset.planPhase === 'ready');
  check(
    'copy execution stays blocked for conflict',
    await page.eval(() => ![...document.querySelectorAll('button')].some(el => el.textContent === '복사 전 검사'))
  );
  await click(page, '충돌 파일 검사');
  await wait(page, () => document.querySelector('[data-backup-phase]')?.dataset.backupPhase === 'ready');
  check('inspection has no writes', await page.eval(() => listingProbe.productWrites === 0));
  check(
    'new and existing files are compared honestly',
    await page.eval(() => document.body.textContent.includes('새 파일 · 유지') && document.body.textContent.includes('기존 목적지 파일 · 백업 대상')
      && document.body.textContent.includes('두 파일의 내용이 다릅니다'))
  );

  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    await new Promise(resolve => setTimeout(resolve, 180));
    await page.eval(() => {
      document.querySelector('dialog:modal').scrollTop = 0;
    });
    check(
      `no overflow ${width}`,
      await page.eval(() => document.documentElement.scrollWidth <= innerWidth
        && document.querySelector('dialog:modal').scrollWidth <= document.querySelector('dialog:modal').clientWidth)
    );
    check(
      `comparison labels use panel width ${width}`,
      await page.eval(() => [...document.querySelectorAll('[data-backup-phase] dt')].every(el => el.getBoundingClientRect().width > 150))
    );
    await page.screenshot({ path: `${out}/review-${width}.png`, format: 'png' });
  }

  await click(page, '기존 파일의 복구 사본 만들기');
  await wait(
    page,
    () => ['completed', 'error', 'cancelled'].includes(document.querySelector('[data-backup-phase]')?.dataset.backupPhase)
  );
  check(
    'actual backup completed',
    await page.eval(() => document.querySelector('[data-backup-phase]')?.dataset.backupPhase === 'completed')
  );
  check(
    'result identifies a verified backup without promising replacement',
    await page.eval(() => document.body.textContent.includes('복구 사본 검증됨') && document.body.textContent.includes('기존 파일은 그대로입니다'))
  );
  check(
    'source unchanged',
    await page.eval(async () => JSON.stringify(await listingProbe.sentinel()) === JSON.stringify(listingProbe.before))
  );
  check(
    'old destination unchanged',
    await page.eval(async () => JSON.stringify(await listingProbe.targetSnapshot()) === JSON.stringify(listingProbe.targetBefore))
  );
  check('vault contains the old destination bytes and paired verified journal', await page.eval(async () => {
    let vault;

    for await (const entry of listingProbe.a.values()) if (entry.kind === 'directory' && entry.name.startsWith('모아 복구 보관함-')) vault = entry;

    let operation;

    for await (const entry of vault.values()) if (entry.kind === 'directory' && entry.name.startsWith('moa-backup-')) operation = entry;

    const prepared = JSON.parse(await (await (await operation.getFileHandle('prepared.json')).getFile()).text());
    const payload = await (await operation.getFileHandle(prepared.items[0].recoveryId + '.bin')).getFile();
    const history = await (await listingProbe.a.getDirectoryHandle('하위 자료')).getDirectoryHandle('.moa-history');
    const paired = await history.getDirectoryHandle(operation.name);
    const left = await (await (await operation.getFileHandle('item-0001-verified.json')).getFile()).text();
    const right = await (await (await paired.getFileHandle('item-0001-verified.json')).getFile()).text();

    return await payload.text() === listingProbe.targetBefore.body && left === right;
  }));
  await page.screenshot({ path: `${out}/completed.png`, format: 'png' });
  await click(page, '계획 닫기');
  await page.eval(() => {
    const get = FileSystemFileHandle.prototype.getFile;

    listingProbe.archivePayloadReads = 0;
    listingProbe.archiveRemoved = 0;
    listingProbe.archivePermissionBaseline = listingProbe.permissionRequests;

    const remove = FileSystemDirectoryHandle.prototype.removeEntry;

    FileSystemDirectoryHandle.prototype.removeEntry = function (...args) {
      if (!listingProbe.preparing) listingProbe.archiveRemoved++;

      return remove.apply(this, args);
    };
    FileSystemFileHandle.prototype.getFile = async function (...args) {
      if (this.name.endsWith('.bin') && !listingProbe.preparing) {
        listingProbe.archivePayloadReads++;

        if (listingProbe.archiveHold) {
          listingProbe.archiveHeld = true;
          await new Promise(resolve => {
            listingProbe.releaseArchive = resolve;
          });
        }
      }

      return get.apply(this, args);
    };
    listingProbe.archiveWriteBaseline = listingProbe.productWrites;
  });

  const listStarted = Date.now();

  await click(page, '복구 보관함 보기');
  await wait(page, () => document.querySelector('[data-archive-phase]')?.dataset.archivePhase === 'ready');

  const listElapsedMs = Date.now() - listStarted;

  check(
    'list is real metadata with no payload reads',
    await page.eval(() => document.querySelectorAll('[aria-label="보관된 복구 사본"] > li').length === 1
      && document.querySelector('[aria-label="보관된 복구 사본"]').textContent.includes('검사 전')
      && listingProbe.archivePayloadReads === 0)
  );
  await click(page, '읽기 안내.md 복구 기록');
  check('expanded details show original location, stored time, bytes and recorded status', await page.eval(() => {
    const text = document.querySelector('[aria-label="보관된 복구 사본"]').textContent;

    return text.includes('하위 자료 / 읽기 안내.md') && text.includes('보관 시각') && text.includes('bytes') && text.includes('백업 완료 기록');
  }));

  const detailStarted = Date.now();

  await click(page, '복구 사본 확인');
  await wait(
    page,
    () => document.querySelector('[data-archive-phase]').textContent.includes('복구 사본이 정상입니다')
  );

  const detailElapsedMs = Date.now() - detailStarted;

  check(
    'explicit inspection verifies real bytes and paired journals',
    await page.eval(() => listingProbe.archivePayloadReads > 0 && document.querySelector('[data-archive-phase]').textContent.includes('양쪽 기록 일치'))
  );
  await page.eval(async () => {
    for await (const entry of listingProbe.a.values()) if (entry.kind === 'directory' && entry.name.startsWith('모아 복구 보관함-')) listingProbe.restoreVault = entry;

    listingProbe.restoreWriteBaseline = listingProbe.productWrites;
    listingProbe.restorePermissionBaseline = listingProbe.permissionRequests;
  });
  check(
    'vault is a direct child of the source root',
    await page.eval(async () => (await listingProbe.a.resolve(listingProbe.restoreVault)).length === 1)
  );
  await click(page, '복원 위치 선택');
  await wait(
    page,
    () => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready'
  );
  await wait(
    page,
    () => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready'
      && document.querySelector('[aria-label="목적지 탐색 위치"]').textContent.trim() === '검증 자료 A'
  );
  check(
    'restore defaults to root and reuses creation while excluding the vault',
    await page.eval(() => !document.querySelector('[aria-label="목적지 하위 폴더"]').textContent.includes(listingProbe.restoreVault.name)
      && !!document.querySelector('[aria-label="현재 위치에 새 항목 만들기"]')
      && document.querySelector('[aria-label="목적지 경로 직접 입력"] input').value === '검증 자료 A')
  );
  await click(page, '검증 자료 A 폴더를 목적지로 선택');
  await wait(page, () => document.querySelector('[data-restore-phase]')?.dataset.restorePhase === 'ready');
  check(
    'read-only preview suggests a distinct file and focuses cancel',
    await page.eval(() => document.querySelector('[data-restore-phase]').textContent.includes('읽기 안내 (복원 1).md')
      && document.activeElement.textContent === '복원 취소'
      && listingProbe.productWrites === listingProbe.restoreWriteBaseline
      && listingProbe.permissionRequests === listingProbe.restorePermissionBaseline)
  );

  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    check(
      `restore review contained ${width}`,
      await page.eval(() => document.documentElement.scrollWidth <= innerWidth
        && document.querySelector('dialog:modal').scrollWidth <= document.querySelector('dialog:modal').clientWidth)
    );
    await page.screenshot({ path: `${out}/restore-review-${width}.png`, format: 'png' });
  }
  // A file created by another application after preview must survive unchanged.

  await page.eval(async () => {
    listingProbe.preparing = true;

    try {
      await listingProbe.a.getFileHandle('읽기 안내 (복원 1).md', { create: true });
    }
    finally {
      listingProbe.preparing = false;
    }

    listingProbe.restoreWriteBaseline = listingProbe.productWrites;
  });
  await click(page, '이 위치에 복원');
  await wait(page, () => document.querySelector('[data-restore-phase]')?.dataset.restorePhase === 'error');
  check(
    'late empty-file collision is not overwritten or retried',
    await page.eval(async () => (await (await listingProbe.a.getFileHandle('읽기 안내 (복원 1).md')).getFile()).size === 0
      && listingProbe.productWrites === listingProbe.restoreWriteBaseline
      && document.querySelector('[data-restore-phase]').textContent.includes('미실행'))
  );
  await click(page, '복원 위치 다시 선택');
  await wait(
    page,
    () => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready'
  );
  await click(page, '검증 자료 A 폴더를 목적지로 선택');
  await wait(page, () => document.querySelector('[data-restore-phase]')?.dataset.restorePhase === 'ready');
  check(
    'new preview proposes next available name',
    await page.eval(() => document.querySelector('[data-restore-phase]').textContent.includes('읽기 안내 (복원 2).md'))
  );
  await page.eval(() => {
    listingProbe.restoreChunkSizes = [];

    const writable = FileSystemFileHandle.prototype.createWritable;

    FileSystemFileHandle.prototype.createWritable = async function (...args) {
      const stream = await writable.apply(this, args);

      if (this.name === '읽기 안내 (복원 2).md') {
        const write = stream.write.bind(stream);

        stream.write = async data => {
          listingProbe.restoreChunkSizes.push(data.size ?? data.byteLength);

          return write(data);
        };
      }

      return stream;
    };
  });

  const restoreStarted = Date.now();

  await click(page, '이 위치에 복원');
  await wait(
    page,
    () => ['completed', 'error', 'cancelled'].includes(document.querySelector('[data-restore-phase]')?.dataset.restorePhase)
  );

  const restoreElapsedMs = Date.now() - restoreStarted;

  check(
    '16 MiB restore completes verified with bounded writes',
    await page.eval(() => document.querySelector('[data-restore-phase]')?.dataset.restorePhase === 'completed'
      && document.querySelector('[data-restore-phase]').textContent.includes('복원 검증됨')
      && listingProbe.restoreChunkSizes.length === 256
      && listingProbe.restoreChunkSizes.every(size => size <= 65536))
  );
  check('restored bytes match immutable backup and both journals match', await page.eval(async () => {
    const restored = await (await listingProbe.a.getFileHandle('읽기 안내 (복원 2).md')).getFile();
    const history = await listingProbe.a.getDirectoryHandle('.moa-history');
    let operation;

    for await (const entry of listingProbe.restoreVault.values()) if (entry.name.startsWith('moa-restore-')) operation = entry;

    const paired = await history.getDirectoryHandle(operation.name);

    for (const name of ['prepared.json', 'item-0001-target-started.json', 'item-0001-target-verified.json', 'stopped.json']) {
      if (await (await (await operation.getFileHandle(name)).getFile()).text() !== await (await (await paired.getFileHandle(name)).getFile()).text()) return false;
    }

    const stopped = JSON.parse(await (await (await paired.getFileHandle('stopped.json')).getFile()).text());

    return await restored.text() === listingProbe.targetBefore.body && stopped.reason === 'completed'
      && stopped.status === 'verified';
  }));
  check(
    'source, prior destination and competing empty file are preserved',
    await page.eval(async () => JSON.stringify(await listingProbe.sentinel()) === JSON.stringify(listingProbe.before)
      && JSON.stringify(await listingProbe.targetSnapshot()) === JSON.stringify(listingProbe.targetBefore)
      && (await (await listingProbe.a.getFileHandle('읽기 안내 (복원 1).md')).getFile()).size === 0)
  );
  await page.screenshot({ path: `${out}/restore-completed.png`, format: 'png' });
  await click(page, '보관함으로 돌아가기');
  // Remove only synthetic original-location data, leaving the vault intact.
  await page.eval(async () => {
    listingProbe.preparing = true;

    try {
      await listingProbe.a.removeEntry('하위 자료', { recursive: true });
    }
    finally {
      listingProbe.preparing = false;
    }
  });
  await click(page, '읽기 안내.md 복구 기록');
  await click(page, '복구 사본 다시 확인');
  await wait(
    page,
    () => document.querySelector('[data-archive-phase]').textContent.includes('원래 위치의 기록 확인 불가')
  );
  await click(page, '복원 위치 선택');
  // 원래 위치가 없어도 기본 복원 위치는 연결 루트다.
  await wait(
    page,
    () => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready'
  );
  await page.eval(() => {
    const input = document.querySelector('[aria-label="목적지 경로 직접 입력"] input');

    input.focus();
    input.select();
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  });
  await page.send('Input.imeSetComposition', { text: '빈 폴더', selectionStart: 4, selectionEnd: 4 });
  check('composing Enter is suppressed in the restore path input', await page.eval(() => {
    const input = document.querySelector('[aria-label="목적지 경로 직접 입력"] input');
    const enter = new KeyboardEvent(
      'keydown',
      { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true, cancelable: true }
    );

    input.dispatchEvent(enter);

    return enter.defaultPrevented && document.querySelector('[aria-label="목적지 탐색 위치"]').textContent.trim() === '검증 자료 A';
  }));
  await page.send('Input.insertText', { text: '빈 폴더' });
  await page.eval(() => document.querySelector('[aria-label="목적지 경로 직접 입력"] input').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '빈 폴더' })));
  await click(page, '경로 열기');
  await wait(
    page,
    () => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready'
  );
  await click(page, '빈 폴더 폴더를 목적지로 선택');
  await wait(page, () => document.querySelector('[data-restore-phase]')?.dataset.restorePhase === 'ready');
  check(
    'missing original folder still permits a preview in another existing folder',
    await page.eval(() => document.querySelector('[data-restore-phase]').textContent.includes('검증 자료 A / 빈 폴더'))
  );
  await page.eval(() => {
    const writable = FileSystemFileHandle.prototype.createWritable;

    FileSystemFileHandle.prototype.createWritable = async function (...args) {
      const stream = await writable.apply(this, args);

      if (this.name === '읽기 안내.md') {
        const write = stream.write.bind(stream);

        stream.write = async data => {
          listingProbe.restoreHeld = true;
          await new Promise(resolve => {
            listingProbe.releaseRestore = resolve;
          });

          return write(data);
        };
      }

      return stream;
    };
  });
  await click(page, '이 위치에 복원');
  await wait(page, () => listingProbe.restoreHeld);
  await page.send(
    'Input.dispatchKeyEvent',
    { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }
  );
  await page.send(
    'Input.dispatchKeyEvent',
    { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }
  );
  check(
    'Escape during writing retains the dialog while cancellation settles',
    await page.eval(() => !!document.querySelector('dialog:modal')
      && document.querySelector('[data-restore-phase]').textContent.includes('중단을 처리'))
  );
  await page.eval(() => listingProbe.releaseRestore());
  await wait(
    page,
    () => document.querySelector('[data-restore-phase]')?.dataset.restorePhase === 'cancelled'
  );
  check('cancelled partial file stays uncertain with no automatic retry or deletion', await page.eval(async () => {
    const file = await (await (await listingProbe.a.getDirectoryHandle('빈 폴더')).getFileHandle('읽기 안내.md')).getFile();

    return file.size === 0 && document.querySelector('[data-restore-phase]').textContent.includes('확인 필요')
      && listingProbe.archiveRemoved === 0;
  }));
  await page.screenshot({ path: `${out}/restore-cancelled.png`, format: 'png' });
  await click(page, '복구 보관함 닫기');
  await click(page, '폴더 연결 관리');
  await page.eval(async () => {
    listingProbe.preparing = true;

    try {
      await listingProbe.a.removeEntry(listingProbe.restoreVault.name, { recursive: true });
    }
    finally {
      listingProbe.preparing = false;
    }

    listingProbe.deletedWriteBaseline = listingProbe.productWrites;
    listingProbe.deletedPermissionBaseline = listingProbe.permissionRequests;
  });
  await click(page, '보관함 상태 확인');
  await wait(page, () => document.body.textContent.includes('보관함을 찾을 수 없어요.'));
  check(
    'external deletion clears current connected state but labels saved history honestly',
    await page.eval(() => document.querySelector('[aria-label="복구 보관함 설정"]').textContent.includes('저장된 연결')
      && !document.querySelector('[aria-label="복구 보관함 설정"]').textContent.includes('위치·식별 확인됨'))
  );
  check('deletion probe does not request permission or recreate vault', await page.eval(async () => {
    let exists = true;

    try {
      await listingProbe.a.getDirectoryHandle(listingProbe.restoreVault.name);
    } catch (error) {
      exists = error.name !== 'NotFoundError';
    }

    return !exists && listingProbe.productWrites === listingProbe.deletedWriteBaseline
      && listingProbe.permissionRequests === listingProbe.deletedPermissionBaseline;
  }));
  await page.screenshot({ path: `${out}/deleted-vault.png`, format: 'png' });
  check('no browser exceptions', page.consoleErrors.length === 0, page.consoleErrors);
  writeFileSync(
    `${out}/timing.json`,
    JSON.stringify(
      {
        restore: { payloadBytes: 16777216, chunks: 256, maxChunkBytes: 65536, elapsedMs: restoreElapsedMs },
        conditions: 'one sample; real OPFS/Worker; synthetic granted permissions; CDP polling included; no OS dialog claim'
      },
      null,
      2
    )
  );
} finally {
  if (page) {
    await page.screenshot({ path: `${out}/last-state.png`, format: 'png' }).catch(() => { });
    writeFileSync(`${out}/last-state.txt`, await page.eval(() => document.body.innerText).catch(String));
  }

  writeFileSync(
    `${out}/checks.json`,
    JSON.stringify({ checks, errors: page?.consoleErrors }, null, 2)
  );
  await browser.close();
}

console.log(`${checks.length} restore UI checks passed`);
