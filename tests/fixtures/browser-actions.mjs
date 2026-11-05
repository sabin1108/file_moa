export async function wait(page, predicate) {
  for (let i = 0; i < 600; i++) {
    if (await page.eval(predicate)) return;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw Error('Timeout: ' + predicate);
}

export async function click(page, label) {
  const point = await page.eval(label => {
    const root = document.querySelector('dialog:modal') ?? document;
    const button = [...root.querySelectorAll('button,summary')].find(el => el.checkVisibility() && !el.disabled && (el.textContent.trim() === label || el.getAttribute('aria-label') === label));
    if (!button) throw Error('Missing enabled button: ' + label);
    button.scrollIntoView({ block: 'center' });
    const rect = button.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }, label);
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
}
