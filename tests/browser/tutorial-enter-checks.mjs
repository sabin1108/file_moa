import assert from 'node:assert/strict';

export async function checkTutorialEnter(page) {
  const step = () => page.evaluate(() => document.querySelector('[data-fixture-step]').textContent);
  await page.waitForSelector('#workspace-tour-title');
  await page.focus('#workspace-tour-title');
  await page.evaluate(() => {
    for (const patch of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }, { shiftKey: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
      document.getElementById('workspace-tour-title').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...patch }));
    }
    const prevented = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    prevented.preventDefault();
    document.getElementById('workspace-tour-title').dispatchEvent(prevented);
    document.getElementById('workspace-tour-title').dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  });
  await page.press('#workspace-tour-title', 'Enter');
  assert.equal(await step(), '1', 'IME, repeat, modified and handled Enter must not advance');
  await page.evaluate(() => document.getElementById('workspace-tour-title').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  await page.press('#workspace-tour-title', 'Enter');
  await page.waitForFunction(() => document.querySelector('[data-fixture-step]').textContent === '2');
  await page.fill('input[aria-label="폴더 이름"]', '새 폴더');
  await page.press('input[aria-label="폴더 이름"]', 'Enter');
  assert.equal(await step(), '2', 'Enter in a form must retain native submission');
  assert.equal(await page.evaluate(() => document.querySelector('output').textContent), '1');
  await page.fill('textarea[aria-label="설명"]', '첫 줄');
  await page.press('textarea[aria-label="설명"]', 'Enter');
  assert.equal(await step(), '2');
  assert.ok(await page.evaluate(() => document.querySelector('textarea').value.includes('\n')));
  await page.focus('button:text-is("이전")'); await page.press('button:text-is("이전")', 'Enter');
  assert.equal(await step(), '1', 'Enter on Previous must not also advance');
  await page.focus('button:text-is("다음")'); await page.press('button:text-is("다음")', 'Enter');
  assert.equal(await step(), '2', 'Native Next must advance exactly once');
  await page.focus('#workspace-tour-title'); await page.press('#workspace-tour-title', 'Enter');
  assert.equal(await step(), '3');
  await page.press('#workspace-tour-title', 'Enter');
  assert.equal(await step(), '완료', 'Enter must complete the last step');
  await page.focus('button:text-is("다시 보기")'); await page.press('button:text-is("다시 보기")', 'Enter');
  await page.waitForSelector('#workspace-tour-title');
  await page.focus('input[type="checkbox"]'); await page.press('input[type="checkbox"]', 'Space');
  await page.focus('#workspace-tour-title'); await page.press('#workspace-tour-title', 'Enter');
  assert.equal(await step(), '1', 'A loading screen must not advance');
  await page.focus('button:text-is("건너뛰기")'); await page.press('button:text-is("건너뛰기")', 'Enter');
  assert.equal(await step(), '완료', 'Native Skip remains available while loading');
  return { plainEnter: true, lastStep: true, nativeControls: true, formSubmit: true, textareaNewline: true, simulatedIme: true, loadingBlocked: true, modifiedAndRepeatBlocked: true };
}
