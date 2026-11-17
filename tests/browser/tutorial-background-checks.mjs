import assert from 'node:assert/strict';

/** 실제 테마를 뒤늦게 적용해도 튜토리얼이 작업 화면을 가리지 않는지 확인한다. */
export async function checkTutorialBackground(page, reorderTheme = false) {
  await page.waitForFunction(() => document.querySelector('dialog[aria-labelledby="workspace-tour-title"][open]')?.getAttribute('aria-busy') === 'false');
  if (reorderTheme) await page.evaluate(() => {
    const dialog = document.querySelector('dialog[aria-labelledby="workspace-tour-title"]');
    const theme = [...dialog.classList].find(name => /(?:^|_)system(?:_|$)/u.test(name));
    if (!theme) throw Error('Workspace theme missing');
    const style = document.createElement('style');
    style.textContent = `.${theme} { background: rgb(237, 240, 238); }`;
    document.head.append(style);
  });
  const result = await page.evaluate(() => {
    const dialog = document.querySelector('dialog[aria-labelledby="workspace-tour-title"]');
    const target = [...document.querySelectorAll('nav[aria-label="주 메뉴"], nav[aria-label="모바일 주 메뉴"], nav[aria-label="모바일 작업 공간"]')].find(node => node.checkVisibility());
    return {
      background: getComputedStyle(dialog).backgroundColor,
      backdrop: getComputedStyle(dialog, '::backdrop').backgroundColor,
      workspaceVisible: !!document.querySelector('[data-conversation-workspace], [data-tour="folder-list"], [data-tour="settings-tabs"]'),
      navigationVisible: !!target,
      title: document.getElementById('workspace-tour-title')?.textContent,
    };
  });
  assert.equal(result.background, 'rgba(0, 0, 0, 0)', 'The tutorial must not paint over the workspace');
  assert.equal(result.backdrop, 'rgba(0, 0, 0, 0)');
  assert.ok(result.workspaceVisible && result.navigationVisible, 'The actual workspace must stay mounted');
  return result;
}
