import assert from 'node:assert/strict';
import { test } from 'node:test';

// 可使用已有 Playwright 安装，不为工具运行时增加依赖。
const playwright = await import(process.env.IMAGE_SPLITTER_PLAYWRIGHT_MODULE ?? 'playwright').catch(() => null);
const engine = process.env.IMAGE_SPLITTER_BROWSER ?? 'chromium';
const baseUrl = process.env.IMAGE_SPLITTER_TEST_URL ?? 'http://127.0.0.1:4323';

async function touchSession(page, context) {
  if (engine === 'chromium') {
    const session = await context.newCDPSession(page);
    return (type, x, y) => session.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
    });
  }
  // WebKit 的公开 tap API 无法拖动，测试使用其原生触控协议。
  const session = page._connection.toImpl(page).delegate._pageProxySession;
  return (type, x, y) => session.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: [{ x: Math.round(x), y: Math.round(y), id: 42 }],
  });
}

for (const width of [1280, 390, 320]) {
  for (const direction of ['vertical', 'horizontal']) {
    test(`${engine} / ${width}px / ${direction}：准备切片时拖动不改变页面滚动且可连续调整`, {
      skip: playwright ? false : '请安装 Playwright 或设置 IMAGE_SPLITTER_PLAYWRIGHT_MODULE',
    }, async () => {
      const mobile = width < 768;
      const browser = await playwright[engine].launch({
        headless: true,
        ...(process.env.IMAGE_SPLITTER_BROWSER_EXECUTABLE
          ? { executablePath: process.env.IMAGE_SPLITTER_BROWSER_EXECUTABLE } : {}),
      });
      try {
        const context = await browser.newContext({
          viewport: { width, height: mobile ? 844 : 900 },
          isMobile: mobile,
          hasTouch: mobile,
        });
        const page = await context.newPage();
        page.setDefaultTimeout(10_000);
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        // 保持导出准备中，稳定覆盖按下时移除状态行的布局变化。
        await page.addInitScript(() => {
          const toBlob = HTMLCanvasElement.prototype.toBlob;
          HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
            toBlob.call(this, (blob) => setTimeout(() => callback(blob), 800), ...args);
          };
        });
        await page.goto(`${baseUrl}/zh-CN/tools/image-splitter`, { waitUntil: 'domcontentloaded' });
        // Astro 的 ssr 标记移除早于 React 提交；等上传事件实际绑定。
        await page.waitForFunction(() => {
          const input = document.querySelector('.image-splitter-tool input[type=file]');
          return input && Object.keys(input).some((key) => key.startsWith('__reactProps$') && input[key].onChange);
        });
        const png = await page.evaluate(() => {
          const canvas = document.createElement('canvas');
          canvas.width = 900;
          canvas.height = 600;
          canvas.getContext('2d').fillRect(0, 0, 900, 600);
          return canvas.toDataURL().split(',')[1];
        });
        await page.locator('input[type=file]').setInputFiles({
          name: 'touch-regression.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64'),
        });
        await page.locator('.image-splitter-file-thumbnail').waitFor();
        const activate = (button) => mobile ? button.tap() : button.click();
        if (direction === 'horizontal') await activate(page.getByRole('button', { name: '横向', exact: true }));
        await activate(page.getByRole('button', { name: '自由切分', exact: true }));
        const dispatchTouch = mobile ? await touchSession(page, context) : null;

        for (const [controlType, index] of [['slider', 0], ['slider', 1], ['preview', 1]]) {
          const slider = page.getByRole('slider').nth(index);
          const control = controlType === 'slider' ? slider : page.locator('.image-splitter-preview-cut-handle').nth(index);
          await control.scrollIntoViewIfNeeded();
          const before = Number(await slider.getAttribute('aria-valuenow'));
          const box = await control.boundingBox();
          const x = box.x + box.width / 2;
          const y = box.y + box.height / 2;
          const scrollBefore = await page.evaluate(() => window.scrollY);
          if (mobile) await dispatchTouch('touchStart', x, y);
          else { await page.mouse.move(x, y); await page.mouse.down(); }
          for (let step = 1; step <= 3; step++) {
            const nextX = x + (direction === 'vertical' ? step * 5 : 0);
            const nextY = y + (direction === 'horizontal' ? step * 5 : 0);
            if (mobile) await dispatchTouch('touchMove', nextX, nextY);
            else await page.mouse.move(nextX, nextY);
            await page.waitForTimeout(35);
          }
          const after = Number(await slider.getAttribute('aria-valuenow'));
          const scrollAfter = await page.evaluate(() => window.scrollY);
          if (mobile) await dispatchTouch('touchEnd', x + (direction === 'vertical' ? 15 : 0), y + (direction === 'horizontal' ? 15 : 0));
          else await page.mouse.up();
          assert.ok(Math.abs(scrollAfter - scrollBefore) <= 1, `拖动期间页面跳动：${scrollBefore} → ${scrollAfter}`);
          assert.ok(after > before, `向正方向拖动应增大切线位置：${before} → ${after}`);
          await page.waitForFunction(() => document.querySelector('.image-splitter-panel').style.minHeight === '');
          await page.getByRole('button', { name: '保存全部 3 张', exact: true }).waitFor();
          await page.waitForFunction(() => !document.querySelector('.image-splitter-save-all').disabled);
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '页面不得横向溢出');
        assert.deepEqual(errors, [], '浏览器不得出现未处理错误');
      } finally {
        await browser.close();
      }
    });
  }
}
