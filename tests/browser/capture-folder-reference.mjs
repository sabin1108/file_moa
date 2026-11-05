import { readFileSync, mkdirSync } from 'node:fs';
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
const root = 'docs/design-reference/final-folder-20261030';
mkdirSync(`${root}/screenshots`, { recursive: true });
const browser = await Browser.launch();
try {
  for (const [name, width, height, output] of [['데스크톱.dc.html', 1440, 900, 'desktop'], ['모바일1_첫화면.dc.html', 390, 844, 'mobile-root'], ['모바일2_폴더안.dc.html', 390, 844, 'mobile-folder'], ['모바일3_미리보기.dc.html', 390, 844, 'mobile-preview']]) {
    // The supplied archive lacks support.js. Render static markup without external code/fonts.
    const html = readFileSync(`${root}/${name}`, 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
    const page = await browser.newPage({ width, height });
    const { frameTree } = await page.send('Page.getFrameTree');
    await page.send('Page.setDocumentContent', { frameId: frameTree.frame.id, html });
    await page.screenshot({ path: `${root}/screenshots/${output}.png`, format: 'png' });
    await page.close();
  }
} finally { await browser.close(); }
