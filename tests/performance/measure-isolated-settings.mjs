// Disposable Chromium profile only; same renderer settings as the folder browser checks.
import { Browser } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
const launch = Browser.launch;
Browser.launch = options => launch.call(Browser, { ...options, extraArgs: ['--no-sandbox', '--disable-gpu'] });
await import('./measure-settings-performance.mjs');
