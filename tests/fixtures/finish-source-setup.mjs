/** File-only regression suites explicitly defer vault setup; product code never auto-dismisses it. */
export async function waitForVisibleAction(page, label) {
  for (let index = 0; index < 300; index++) {
    if (await page.eval(label => [...document.querySelectorAll('button,summary,input[type="checkbox"]')].some(el =>
      el.checkVisibility() && !el.disabled
      && (el.textContent.trim() === label || el.getAttribute('aria-label') === label
        || el.closest('label')?.textContent.trim() === label)), label)) return;

    await new Promise(done => setTimeout(done, 30));
  }

  throw Error(`Visible action did not become available: ${label}`);
}

export async function finishSourceSetup(page) {
  for (let index = 0; index < 300; index++) {
    const point = await page.eval(() => {
      const button = [...document.querySelectorAll('button')].find(el =>
        el.checkVisibility() && !el.disabled && ['보관함은 나중에 연결', '연결 마치기'].includes(el.textContent.trim()));

      if (!button) return null;

      button.scrollIntoView({ block: 'center' });

      const bounds = button.getBoundingClientRect();

      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    });

    if (point) {
      for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });

      return;
    }

    await new Promise(done => setTimeout(done, 30));
  }

  throw Error('Explicit folder setup finish did not become available');
}
