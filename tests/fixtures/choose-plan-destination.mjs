/** 목적지 통합 선택 UI를 실제 조작한다. 직접 입력은 탐색 후보일 뿐, 폴더 선택을 눌러야 확정한다. */
export async function choosePlanDestination(page, click, path) {
  await click('목적지 선택');

  for (let n = 0; n < 300; n++) {
    if (await page.eval(() => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready')) break;

    await new Promise(resolve => setTimeout(resolve, 30));
  }

  await page.eval(path => {
    const input = document.querySelector('[aria-label="목적지 경로 직접 입력"] input');

    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, path);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, path);
  await click('경로 열기');

  for (let n = 0; n < 300; n++) {
    if (await page.eval(() => document.querySelector('[data-destination-phase]')?.dataset.destinationPhase === 'ready')) {
      const label = await page.eval(() => document.querySelector('[data-destination-phase] button[aria-label$="폴더를 목적지로 선택"]').getAttribute('aria-label'));

      await click(label);

      return;
    }

    await new Promise(resolve => setTimeout(resolve, 30));
  }

  throw Error('Destination path did not become selectable');
}
