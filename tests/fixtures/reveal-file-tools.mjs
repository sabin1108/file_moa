/** Hidden row checkboxes are entered by the same Space action available to users. Returns true if toggled. */
export async function revealSelectionControl(page, label) {
  const entered = await page.eval(label => {
    const listing = document.querySelector('[data-listing-phase]');

    if (!listing?.getClientRects().length || document.querySelector('dialog[open]')) return;

    const target = [...listing.querySelectorAll('button,input[type="checkbox"]')].find(el =>
      el.textContent.trim() === label || el.getAttribute('aria-label') === label
      || el.closest('label')?.textContent.trim() === label);

    if (!target || target.getClientRects().length
      || !(target.matches('input[type="checkbox"]') || target.closest('[aria-label="파일 선택"]'))) return;

    const row = target.closest('[data-selecting]');
    const action = row?.querySelector('button, [tabindex="0"]');

    if (!action) return false;

    action.focus();

    return true;
  }, label);

  if (entered) for (const type of ['keyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });

  return !!entered;
}

export async function revealSearch(page) {
  await page.eval(() => {
    if (document.querySelector('[role="search"] input')?.getClientRects().length) return;

    [...document.querySelectorAll('[data-listing-phase] button[aria-expanded="false"]')].find(el => el.textContent === '검색')?.click();
  });
}

/** Back now traverses browser history asynchronously; wait for the list and its scheduled focus restoration. */

export async function settleHistoryReturn(page, label) {
  if (label !== '목록으로 돌아가기') return;

  for (let n = 0; n < 200; n++) {
    if (await page.eval(() => !document.querySelector('[data-preview-phase]'))) {
      await page.eval(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));

      return;
    }

    await new Promise(done => setTimeout(done, 30));
  }

  throw Error('Browser history return did not restore listing');
}
