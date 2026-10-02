/* global window, CanvasRenderingContext2D, Element */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { _electron } = require('playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const profile = path.join(
    root,
    'qa',
    `performance-${process.argv[2] || 'baseline'}-${Date.now()}`,
  );
  fs.mkdirSync(profile, { recursive: true });
  const env = { ...process.env, MESP_DOCK_DATA_DIR: profile, MESP_DOCK_TEST_HIDDEN: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'),
    args: [root],
    cwd: root,
    env,
  });
  const measures = [];
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('dock:generate-title');
      ipcMain.handle('dock:generate-title', () => null);
    });
    await page.waitForFunction(() => localStorage.getItem('mesp-top-projects-v1'));
    const first = await page.evaluate(
      () => JSON.parse(localStorage.getItem('mesp-top-projects-v1'))[0],
    );
    await page.addInitScript((first) => {
      if (!localStorage.getItem('perf-seed')) {
        localStorage.setItem('perf-seed', '1');
        localStorage.setItem(
          'mesp-top-projects-v1',
          JSON.stringify(
            Array.from({ length: 10 }, (_, i) => ({
              ...first,
              id: i ? `mesp-perf-${i}` : first.id,
              name: `Sistema ${i + 1}`,
              taskTitle: `Implementar sistema ${i + 1}`,
            })),
          ),
        );
      }
      window.__perf = { raf: 0, draw: 0, rect: 0, storage: 0, tasks: [] };
      const nativeRaf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) =>
        nativeRaf((now) => {
          window.__perf.raf++;
          cb(now);
        });
      const nativeDraw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        window.__perf.draw++;
        return nativeDraw.apply(this, args);
      };
      const nativeRect = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () {
        window.__perf.rect++;
        return nativeRect.call(this);
      };
      const nativeStorage = Storage.prototype.setItem;
      Storage.prototype.setItem = function (...args) {
        window.__perf.storage++;
        return nativeStorage.apply(this, args);
      };
      new PerformanceObserver((items) =>
        items.getEntries().forEach((entry) => window.__perf.tasks.push(entry.duration)),
      ).observe({ type: 'longtask', buffered: true });
    }, first);
    const start = Date.now();
    await page.reload();
    await page.locator('.dock-compact').click();
    await page.getByRole('button', { name: 'Manter painel aberto', exact: true }).click();
    const startupMs = Date.now() - start;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const sample = async (name) => {
      await delay(1500);
      await page.evaluate(() => {
        window.__perf = { raf: 0, draw: 0, rect: 0, storage: 0, tasks: [] };
      });
      const initialMetrics = await cdp.send('Performance.getMetrics');
      const t = Date.now();
      await delay(2500);
      const counters = await page.evaluate(() => window.__perf);
      const finalMetrics = await cdp.send('Performance.getMetrics');
      const metrics = Object.fromEntries(finalMetrics.metrics.map((m) => [m.name, m.value]));
      const initial = Object.fromEntries(initialMetrics.metrics.map((m) => [m.name, m.value]));
      const result = {
        name,
        elapsedMs: Date.now() - t,
        ...counters,
        taskMs: (metrics.TaskDuration - initial.TaskDuration) * 1000,
        layoutMs: (metrics.LayoutDuration - initial.LayoutDuration) * 1000,
        heapMB: metrics.JSHeapUsedSize / 1048576,
        canvases: await page.locator('canvas.dock-mascot').count(),
        activeCanvases: await page.locator('canvas.dock-mascot[data-paused="false"]').count(),
      };
      measures.push(result);
      console.log(JSON.stringify(result));
      assert.ok(result.raf < result.elapsedMs / 10, 'A single animation clock serves all ten pets');
      assert.equal(result.rect, 0, 'Stable idle layout performs no periodic hit-test reads');
      assert.ok(result.activeCanvases <= 10, 'Duplicated and offscreen characters do not animate');
      if (name === 'fully-hidden') {
        assert.equal(result.raf, 0);
        assert.equal(result.draw, 0);
        assert.equal(result.activeCanvases, 0);
      }
    };
    await sample('chat-ten-mesp');
    const field = page.getByRole('textbox', { name: 'Pedir ao MESP', exact: true });
    await field.pressSequentially('Rascunho para testar rapidez ao escrever no MESP.', {
      delay: 12,
    });
    await page.waitForFunction(() =>
      localStorage.getItem('mesp-top-drafts-v1')?.includes('Rascunho para testar'),
    );
    await sample('after-typing');
    await page.getByRole('button', { name: 'Ver todos os MESP', exact: true }).click();
    await sample('projects-ten-mesp');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await sample('fully-hidden');
    await page.reload();
    await page.locator('.dock-compact').click();
    assert.equal(await field.inputValue(), 'Rascunho para testar rapidez ao escrever no MESP.');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await sample('reduced-motion');
    assert.ok(measures.at(-1).draw < 180, 'Reduced motion lowers the repaint cost');
    fs.writeFileSync(
      path.join(profile, 'report.json'),
      JSON.stringify({ startupMs, measures, hiddenTest: true }, null, 2),
    );
    console.log(JSON.stringify({ startupMs, profile }));
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
