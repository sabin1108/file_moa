import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
import { installFolderBrowserFixture } from '../fixtures/folder-browser-fixture.mjs';
import { revealSelectionControl } from '../fixtures/reveal-file-tools.mjs';
import { choosePlanDestination } from '../fixtures/choose-plan-destination.mjs';
import { wait, click } from '../fixtures/browser-actions.mjs';

const base = process.argv[2] || 'http://127.0.0.1:3014';
const out = process.argv[3] || 'docs/verification/recovery-archive/ui';

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
    listingProbe.name = '검증 자료 B';
  });
  await click(page, '새 보관함 만들기');
  await click(page, '만들 위치 선택');
  await wait(page, () => document.body.textContent.includes('생성 위치: 검증 자료 B'));
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

      await stream.write('이전 목적지의 보관할 내용');
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

    for await (const entry of listingProbe.b.values()) if (entry.kind === 'directory' && entry.name.startsWith('모아 복구 보관함-')) vault = entry;

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

  for (const width of [390, 768, 1440, 1920]) {
    await page.setViewport({ width, height: 900 });
    await page.eval(() => {
      document.querySelector('dialog:modal').scrollTop = 0;
    });
    check(
      `archive detail contained ${width}`,
      await page.eval(() => document.documentElement.scrollWidth <= innerWidth
        && document.querySelector('dialog:modal').scrollWidth <= document.querySelector('dialog:modal').clientWidth)
    );
    await page.screenshot({ path: `${out}/archive-${width}.png`, format: 'png' });
  }

  await page.eval(async () => {
    listingProbe.preparing = true;

    try {
      let vault;

      for await (const entry of listingProbe.b.values()) if (entry.kind === 'directory' && entry.name.startsWith('모아 복구 보관함-')) vault = entry;

      for await (const entry of vault.values()) if (entry.kind === 'directory' && entry.name.startsWith('moa-backup-')) listingProbe.archiveOperation = entry;

      const op = listingProbe.archiveOperation;
      const prepared = JSON.parse(await (await (await op.getFileHandle('prepared.json')).getFile()).text());

      listingProbe.archivePayload = await op.getFileHandle(prepared.items[0].recoveryId + '.bin');
      listingProbe.archiveOriginal = await (await listingProbe.archivePayload.getFile()).arrayBuffer();

      const stream = await listingProbe.archivePayload.createWritable();

      await stream.write('synthetic corrupt payload');
      await stream.close();
    } finally {
      listingProbe.preparing = false;
    }

    listingProbe.archiveWriteBaseline = listingProbe.productWrites;
  });
  await click(page, '복구 사본 다시 확인');
  await wait(
    page,
    () => document.querySelector('[data-archive-phase]').textContent.includes('복구 사본이 없거나 손상됐어요')
  );
  check(
    'corruption clears the earlier normal result',
    await page.eval(() => !document.querySelector('[data-archive-phase]').textContent.includes('복구 사본이 정상입니다')
      && document.querySelector('[aria-label="보관된 복구 사본"] summary').textContent.includes('손상'))
  );
  await page.screenshot({ path: `${out}/archive-damaged.png`, format: 'png' });
  await page.eval(async () => {
    listingProbe.preparing = true;

    try {
      const stream = await listingProbe.archivePayload.createWritable();

      await stream.write(listingProbe.archiveOriginal);
      await stream.close();

      const history = await (await listingProbe.a.getDirectoryHandle('하위 자료')).getDirectoryHandle('.moa-history');

      await history.removeEntry(listingProbe.archiveOperation.name, { recursive: true });
    } finally {
      listingProbe.preparing = false;
    }

    listingProbe.archiveWriteBaseline = listingProbe.productWrites;
  });
  await click(page, '복구 사본 다시 확인');
  await wait(
    page,
    () => document.querySelector('[data-archive-phase]').textContent.includes('원래 위치의 기록 확인 불가')
  );
  check(
    'valid payload with missing destination journals is uncertain',
    await page.eval(() => document.querySelector('[data-archive-phase]').textContent.includes('크기·내용 일치')
      && document.querySelector('[aria-label="보관된 복구 사본"] summary').textContent.includes('확인 필요'))
  );
  check(
    'verified payload can choose restore elsewhere without a delete action',
    await page.eval(() => [...document.querySelectorAll('[data-archive-phase] button')].some(b => b.textContent === '복원 위치 선택')
      && ![...document.querySelectorAll('[data-archive-phase] button')].some(b => /삭제/.test(b.textContent)))
  );
  await page.eval(() => {
    listingProbe.archiveHold = true;
  });
  await click(page, '복구 사본 다시 확인');
  await wait(page, () => listingProbe.archiveHeld);
  await click(page, '읽기 취소');
  await page.eval(() => {
    listingProbe.archiveHold = false;
    listingProbe.releaseArchive();
  });
  await wait(page, () => document.querySelector('[data-archive-phase]').textContent.includes('확인을 취소했어요'));
  check(
    'cancel discards late verification result',
    await page.eval(() => !document.querySelector('[data-archive-phase]').textContent.includes('복구 사본이 정상입니다'))
  );
  await click(page, '복구 보관함 닫기');
  check(
    'close restores file toolbar trigger',
    await page.eval(() => !document.querySelector('dialog:modal') && document.activeElement.textContent === '복구 보관함 보기')
  );

  for (let i = 0; i < 10; i++) {
    await click(page, '복구 보관함 보기');
    await wait(page, () => document.querySelector('[data-archive-phase]')?.dataset.archivePhase === 'ready');
    await page.send(
      'Input.dispatchKeyEvent',
      { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }
    );
    await page.send(
      'Input.dispatchKeyEvent',
      { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }
    );
    assert.ok(await page.eval(() => document.querySelector('dialog:modal').contains(document.activeElement)));
    await page.send(
      'Input.dispatchKeyEvent',
      { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }
    );
    await page.send(
      'Input.dispatchKeyEvent',
      { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }
    );
  }

  check(
    'ten open and Escape cycles preserve modal focus and trigger',
    await page.eval(() => !document.querySelector('dialog:modal') && document.activeElement.textContent === '복구 보관함 보기')
  );
  check(
    'archive operations request no permissions, create no writable and delete nothing',
    await page.eval(() => listingProbe.permissionRequests === listingProbe.archivePermissionBaseline
      && listingProbe.productWrites === listingProbe.archiveWriteBaseline
      && listingProbe.archiveRemoved === 0)
  );
  check(
    'source and target unchanged by archive reads',
    await page.eval(async () => JSON.stringify(await listingProbe.sentinel()) === JSON.stringify(listingProbe.before)
      && JSON.stringify(await listingProbe.targetSnapshot()) === JSON.stringify(listingProbe.targetBefore))
  );
  check('no browser exceptions', page.consoleErrors.length === 0, page.consoleErrors);
  writeFileSync(`${out}/timing.json`, JSON.stringify({
    metadataList: { operations: 1, items: 1, payloadReads: 0, elapsedMs: listElapsedMs },
    detail: { payloadBytes: 36, elapsedMs: detailElapsedMs },
    conditions: 'one sample; real OPFS/Worker; CDP polling included; no OS permission UI'
  }, null, 2));
} finally {
  writeFileSync(
    `${out}/checks.json`,
    JSON.stringify({ checks, errors: page?.consoleErrors }, null, 2)
  );
  await browser.close();
}

console.log(`${checks.length} archive UI checks passed`);
