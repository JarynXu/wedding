import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { databaseUrl, fixture, payload, post } from './blessings-fixture.mjs';
const require = createRequire(import.meta.url);
const enter = async (page, origin, query = '') => {
  await page.goto(origin + '/' + query, { waitUntil: 'domcontentloaded' });
  await page.locator('#preloaderOverlay[data-state="ready"]').waitFor({ timeout: 60000 });
  assert.equal(await page.locator('#blessingEntry').isVisible(), false);
  await page.locator('#btnEnterInvitation').click();
  await page.locator('#blessingEntry[data-connection="connected"]').waitFor({ timeout: 15000 });
};
test('手机双主题：送出、实时收取、祝福簿、重试与动态效果', { skip: !databaseUrl && '需要隔离 PostgreSQL', timeout: 100000 }, async suite => {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
  const f = await fixture();
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const errors = [];
  try {
    const a = await f.instance(); const b = await f.instance();
    const classic = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const chinese = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    let rejectedStream = false;
    await chinese.route('**/api/blessings/stream*', async route => {
      if (!rejectedStream) { rejectedStream = true; await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"UNAVAILABLE"}' }); }
      else await route.continue();
    });
    for (const page of [classic, chinese]) page.on('pageerror', error => errors.push(error.message));
    await Promise.all([enter(classic, a.origin), enter(chinese, b.origin, '?theme=chinese&side=groom&parents=测试父母')]);
    assert.equal(rejectedStream, true, '首次 SSE 503 后可恢复连接');
    await suite.test('两套主题展示各自礼物，弹窗保持毛玻璃，手机尺寸不溢出', async () => {
      for (const [page, theme, expected] of [[classic, 'classic', ['rose', 'champagne', 'rings', 'fireworks']], [chinese, 'chinese', ['fireworks', 'lantern', 'knot', 'double-happiness']]]) {
        await page.locator('#blessingEntry').click();
        assert.equal(await page.locator('.blessings-heading').count(), 0);
        assert.deepEqual(await page.locator('.blessing-gift-options button').evaluateAll(nodes => nodes.map(node => node.dataset.gift)), expected);
        for (const [width, height] of [[320, 568], [375, 667], [390, 844], [414, 896], [768, 1024]]) {
          await page.setViewportSize({ width, height });
          const layout = await page.locator('.blessings-card').evaluate(card => ({ width: card.clientWidth, scroll: card.scrollWidth, blur: getComputedStyle(card).backdropFilter, body: document.body.scrollWidth, viewport: innerWidth, inputSize: getComputedStyle(card.querySelector('input')).fontSize }));
          assert.ok(layout.scroll <= layout.width + 1); assert.ok(layout.body <= layout.viewport); assert.match(layout.blur, /blur/); assert.equal(layout.inputSize, '16px');
          const alignment=await page.locator('.blessings-card').evaluate(card=>{const box=card.getBoundingClientRect(),tabs=card.querySelector('.blessings-tabs').getBoundingClientRect();return Math.abs((box.left+box.right)/2-(tabs.left+tabs.right)/2);});assert.ok(alignment<1,'两个页签相对面板居中');
          const send = page.locator('.blessing-send'); await send.scrollIntoViewIfNeeded(); assert.equal(await send.isVisible(), true);
          const before = await page.locator('.blessings-card').boundingBox();
          await page.locator('[data-tab="history"]').click();
          await page.locator('.blessing-empty').waitFor();
          const after = await page.locator('.blessings-card').boundingBox();
          assert.ok(Math.abs(before.height - after.height) < 1 && Math.abs(before.y - after.y) < 1, '空祝福簿与表单的外框保持同一位置和高度');
          const scrollbar = await page.locator('.blessing-history-list').evaluate(node => ({ width: getComputedStyle(node).scrollbarWidth, color: getComputedStyle(node).scrollbarColor }));
          const edge=await page.locator('.blessing-history-list').evaluate(node=>{const panel=node.closest('.blessings-card').getBoundingClientRect();return {gap:panel.right-node.getBoundingClientRect().right,padding:parseFloat(getComputedStyle(node).paddingRight)};});assert.ok(edge.gap>=2&&edge.gap<=14);assert.ok(edge.padding>=20);
          assert.equal(scrollbar.width, 'thin'); assert.notEqual(scrollbar.color, 'auto');
          await page.locator('[data-tab="compose"]').click();
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('.blessings-card').evaluate(card => { card.scrollTop = 0; });
        if (process.env.WEDDING_QA_DIR) { await page.waitForTimeout(350); await page.screenshot({ path: join(process.env.WEDDING_QA_DIR, `blessings-${theme}.png`) }); }
        await page.locator('#blessingsModal .modal-close').click();
        assert.equal(await page.locator('#blessingEntry i').count(), 0);
        for (const width of [320, 375, 414]) {
          await page.setViewportSize({ width, height: 844 });
          const controls = await page.locator('.blessing-dock button').evaluateAll(buttons => buttons.map(button => {
            const r=button.getBoundingClientRect(), next=document.querySelector('.page-1 .scroll-hint').getBoundingClientRect();
            return { width:r.width, height:r.height, right:r.right, viewport:innerWidth, overlap:r.right>next.left&&r.left<next.right&&r.top<next.bottom&&r.bottom>next.top };
          }));
          assert.ok(controls.every(r=>r.width>=44&&r.height>=44&&r.right<=r.viewport&&!r.overlap), '快捷礼物完整可点，不遮挡翻页按钮');
        }
        await page.setViewportSize({ width: 390, height: 844 });
      }
    });
    await suite.test('一端送出礼物，另一端收到气泡和画布效果；正文按纯文本保存', async () => {
      await classic.locator('#blessingEntry').click();
      await classic.locator('#blessingName').fill('测试亲友');
      await classic.locator('#blessingMessage').fill('幸福长久 <b>愿岁岁欢喜</b>');
      await classic.locator('[data-gift="fireworks"]').click();
      await classic.locator('.blessing-send').click();
      await classic.locator('#blessingsModal.open').waitFor({ state: 'hidden' });
      await chinese.locator('.blessing-bubble').filter({ hasText: '幸福长久' }).waitFor();
      await chinese.locator('.gift-effects[data-state="playing"][data-gift="fireworks"]').waitFor();
      assert.equal(await chinese.locator('.blessing-bubble b').count(), 0);
      const draw = await chinese.locator('.gift-effects').evaluate(async canvas => {
        const sums = [];
        for (let i = 0; i < 12; i++) { await new Promise(resolve => setTimeout(resolve, 75)); const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; let sum = 0; for (let a = 3; a < pixels.length; a += 4) sum += pixels[a]; sums.push(sum); }
        return sums;
      });
      assert.ok(Math.max(...draw) > 0); assert.ok(new Set(draw).size > 3, '礼物画布有实际变化');
      if (process.env.WEDDING_QA_DIR) await chinese.screenshot({ path: join(process.env.WEDDING_QA_DIR, 'blessings-live.png') });
      await chinese.locator('#blessingEntry').click(); await chinese.locator('[data-tab="history"]').click();
      await chinese.locator('.blessing-history-item').filter({ hasText: '幸福长久' }).waitFor();
      assert.equal(await chinese.locator('.blessing-history-item b').count(), 0);
      assert.match(await chinese.locator('.blessing-history-item').innerText(), /送来烟花/);
      if (process.env.WEDDING_QA_DIR) { await chinese.waitForTimeout(450); await chinese.screenshot({ path: join(process.env.WEDDING_QA_DIR, 'blessings-history.png') }); }
      await chinese.locator('#blessingsModal .modal-close').click();
    });
    await suite.test('翻页保持同一个祝福入口与连接；返回首屏不被遮住', async () => {
      const connectionCount = await chinese.evaluate(() => performance.getEntriesByType('resource').filter(entry => entry.name.includes('/stream')).length);
      for (let index = 1; index < 4; index++) {
        await chinese.locator(`.nav-dot[data-index="${index}"]`).click();
        await chinese.locator(`.nav-dot[data-index="${index}"][aria-current="page"]`).waitFor();
        await chinese.waitForTimeout(900);
        assert.equal(await chinese.locator('#blessingEntry').count(), 1);
        assert.equal(await chinese.locator('#blessingEntry').isVisible(), true);
      }
      assert.equal(await chinese.evaluate(() => performance.getEntriesByType('resource').filter(entry => entry.name.includes('/stream')).length), connectionCount);
      await chinese.locator('.nav-dot[data-index="0"]').click(); await chinese.waitForTimeout(900);
      const layout = await chinese.locator('#blessingEntry').evaluate(entry => {
        const e = entry.getBoundingClientRect(); const next = document.querySelector('.page-1 .scroll-arrow').getBoundingClientRect();
        return { overlap: e.right > next.left && e.left < next.right && e.top < next.bottom && e.bottom > next.top, hit: document.elementFromPoint(e.x + e.width / 2, e.y + e.height / 2)?.closest('#blessingEntry') !== null };
      });
      assert.equal(layout.overlap, false); assert.equal(layout.hit, true);
    });
    await suite.test('保存后丢失响应：保留请求，重试只产生一条记录', async () => {
      let intercept = true;
      await classic.route('**/api/blessings', async route => { if (intercept && route.request().method() === 'POST') { intercept = false; await route.fetch(); await route.abort(); } else await route.continue(); });
      await classic.locator('#blessingEntry').click(); await classic.locator('#blessingMessage').fill('响应中断测试');
      await classic.locator('.blessing-send').click();
      await classic.locator('.blessing-result').filter({ hasText: '暂未确认送达' }).waitFor();
      assert.equal(await classic.locator('#blessingMessage').inputValue(), '响应中断测试');
      await classic.locator('.blessing-send').click(); await classic.locator('#blessingsModal.open').waitFor({ state: 'hidden' });
      const rows = await f.db.query('SELECT count(*)::int AS count FROM wedding_blessings WHERE room_id=$1 AND message=$2', [f.config.room, '响应中断测试']); assert.equal(rows.rows[0].count, 1);
      await classic.unroute('**/api/blessings');
    });
    await suite.test('快捷礼物不发送未提交文字；响应中断后原礼物重试只保存一次', async () => {
      await classic.locator('#blessingEntry').click(); await classic.locator('#blessingMessage').fill('尚未送出的草稿');
      await classic.locator('#blessingsModal .modal-close').click();
      let intercept=true;
      await classic.route('**/api/blessings', async route=>{if(intercept&&route.request().method()==='POST'){intercept=false;await route.fetch();await route.abort();}else await route.continue();});
      await classic.locator('[data-quick-gift="rose"]').click();
      await classic.locator('.gift-effects[data-state="playing"][data-gift="rose"]').waitFor();
      assert.equal(await classic.locator('.blessing-quick-feedback').count(),0);
      await classic.waitForTimeout(1100);
      await classic.locator('[data-quick-gift="rose"]').click();
      await classic.waitForFunction(()=>JSON.parse(localStorage.getItem('wedding.blessings.pendingGift'))===null);
      assert.equal(await classic.locator('#blessingsModal.open').count(),0);
      assert.equal(await classic.locator('#blessingMessage').inputValue(),'尚未送出的草稿');
      const saved=await f.db.query('SELECT message FROM wedding_blessings WHERE room_id=$1 AND gift_id=$2',[f.config.room,'rose']);
      assert.deepEqual(saved.rows,[{message:''}]);
      await classic.unroute('**/api/blessings');
    });
    await suite.test('长按在松手时记录显示数量，快捷重复点击受限时仍播放且不提示', async () => {
      await classic.locator('.gift-effects[data-state="idle"]').waitFor();
      const posts=[];
      await classic.route('**/api/blessings',async route=>{if(route.request().method()==='POST')posts.push(route.request().postDataJSON());await route.continue();});
      const button=classic.locator('[data-quick-gift="rose"]'),box=await button.boundingBox();
      await classic.mouse.move(box.x+box.width/2,box.y+box.height/2);await classic.mouse.down();
      await classic.waitForTimeout(1400);
      const played=Number(await classic.locator('.gift-effects').getAttribute('data-active-count'));
      assert.ok(played>=4&&played<=5);assert.equal(posts.length,0,'长按期间不逐个请求后端');
      await classic.mouse.up();
      await classic.waitForFunction(()=>JSON.parse(localStorage.getItem('wedding.blessings.pendingGift'))===null);
      assert.equal(posts.length,1);assert.equal(posts[0].giftCount,played);
      for(let i=0;i<3;i++)await button.click();
      assert.equal(posts.length,1,'前端记录限频不逐个请求');
      assert.equal(Number(await classic.locator('.gift-effects').getAttribute('data-active-count')),played+3,'每次点击均新增可见效果，服务端回声不重播');
      assert.equal(await classic.locator('.blessing-quick-feedback').count(),0);
      await classic.locator('#blessingEntry').click();
      assert.equal(await classic.locator('.blessings-heading').count(),0);
      await classic.locator('[data-tab="history"]').click();
      await classic.locator('.blessing-history-gift').filter({hasText:`玫瑰 × ${played}`}).waitFor();
      await classic.locator('#blessingsModal .modal-close').click();
      await classic.unroute('**/api/blessings');
    });
    await suite.test('中式手机触摸长按可连续播放，松手停止并记录数量',async()=>{
      await enter(chinese,b.origin,'?theme=chinese');
      await chinese.locator('.gift-effects[data-state="idle"]').waitFor();
      const calls=[];
      await chinese.route('**/api/blessings',async route=>{if(route.request().method()==='POST')calls.push(route.request().postDataJSON());await route.continue();});
      const box=await chinese.locator('[data-quick-gift="lantern"]').boundingBox();
      const touch=await chinese.context().newCDPSession(chinese);
      let touching=false;
      try {
        await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+22,y:box.y+22}]});
        touching=true;
        await chinese.waitForTimeout(1400);
        const count=Number(await chinese.locator('.gift-effects').getAttribute('data-active-count'));
        assert.ok(count>=4&&count<=5);assert.equal(calls.length,0);
        await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        touching=false;
        await chinese.waitForFunction(()=>JSON.parse(localStorage.getItem('wedding.blessings.pendingGift'))===null);
        assert.equal(calls.length,1);assert.equal(calls[0].giftCount,count);
        assert.equal(await chinese.locator('.is-holding').count(),0);
        if(process.env.WEDDING_QA_DIR)await chinese.screenshot({path:join(process.env.WEDDING_QA_DIR,'gifts-hold-chinese.png')});
      }finally{if(touching)await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await touch.detach();await chinese.unroute('**/api/blessings');}
    });
    await suite.test('长祝福簿在主题内容区滚动，不改变外框高度', async () => {
      await classic.locator('#blessingEntry').click();
      await classic.locator('.blessings-card').evaluate(async card=>{await Promise.all(card.getAnimations().map(animation=>animation.finished));});
      const formBox=await classic.locator('.blessings-card').boundingBox();
      await Promise.all(Array.from({length:32},(_,i)=>post(a.origin,payload({name:`祝福簿测试 ${i}`,text:'愿你们岁岁相伴，年年欢喜。'.repeat(5)}))));
      await classic.locator('[data-tab="history"]').click();
      await classic.waitForFunction(()=>document.querySelectorAll('.blessing-history-item').length===30);
      const historyBox=await classic.locator('.blessings-card').boundingBox();
      assert.ok(Math.abs(historyBox.height-formBox.height)<1);
      const list=classic.locator('.blessing-history-list');
      assert.equal(await classic.locator('[data-history]').count(),0);
      await classic.waitForFunction(()=>document.querySelector('.blessing-history-list').scrollTop>25);
      const bounds=await list.boundingBox();await classic.mouse.move(bounds.x+30,bounds.y+60);await classic.mouse.wheel(0,160);
      await classic.waitForTimeout(300);const manual=await list.evaluate(node=>node.scrollTop);
      await classic.waitForTimeout(1300);assert.ok(Math.abs(await list.evaluate(node=>node.scrollTop)-manual)<2,'手动滚动后不再自动推进');
      const timeBounds=await list.locator('time').first().evaluate(node=>{const r=node.getBoundingClientRect(),p=node.closest('.blessing-history-list').getBoundingClientRect();return {right:r.right,edge:p.right};});
      assert.ok(timeBounds.edge-timeBounds.right>=12,'时间与滚动条保留间距');
      await list.evaluate(node=>{node.scrollTop=node.scrollHeight;});await classic.waitForFunction(()=>document.querySelectorAll('.blessing-history-item').length>30);
      await classic.locator('#blessingsModal .modal-close').click();
    });
    await suite.test('祝福默认实时显示，无连接状态行，保留礼物单独发送和减少动态效果', async () => {
      assert.equal(await chinese.locator('.blessings-footer,#blessingFloat,.blessing-connection').count(),0);
      await chinese.locator('#blessingEntry').click(); await chinese.locator('button[data-gift="lantern"]').click(); await chinese.locator('.blessing-send').click();
      await chinese.locator('#blessingsModal.open').waitFor({ state: 'hidden' });
      await chinese.emulateMedia({ reducedMotion: 'reduce' });
      await chinese.reload(); await chinese.locator('#preloaderOverlay[data-state="ready"]').waitFor(); await chinese.locator('#btnEnterInvitation').click();
      await chinese.locator('#blessingEntry[data-connection="connected"]').waitFor();
      assert.equal(await chinese.locator('.gift-effects[data-state="playing"]').count(), 0);
      await chinese.locator('#blessingEntry').click(); await chinese.locator('[data-tab="history"]').click(); await chinese.locator('.blessing-history-item').filter({ hasText: '送来喜灯' }).waitFor();
      await chinese.keyboard.press('Escape'); assert.equal(await chinese.locator('#blessingsModal').getAttribute('inert'), '');
      assert.equal(await chinese.evaluate(() => document.activeElement.id), 'blessingEntry');
    });
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await f.close(); }
});
