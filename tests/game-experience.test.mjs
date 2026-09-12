import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { gameFixture,gameTestDatabase } from './game-fixture.mjs';
import { fixture as blessingsFixture,waitFor } from './blessings-fixture.mjs';
const require=createRequire(import.meta.url);

test('手机授权弹窗、分段规则、称呼同步与AI写祝福草稿',{skip:!gameTestDatabase&&'需要隔离数据库',timeout:60000},async()=>{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
  const g=await gameFixture(),writingCalls=[];
  let delayed,release;
  const writing={configured:true,async compose(text,theme){writingCalls.push({text,theme});if(delayed)await new Promise(resolve=>{release=resolve;});return '愿你们岁岁相伴，年年欢喜。';}};
  const b=await blessingsFixture({}, {writing});let browser;
  try{
    const instance=await b.instance(),origin=await g.server({blessings:instance.service});
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await context.addInitScript(()=>{window.initAlicom4=(_options,callback)=>{window.captchaStarts=(window.captchaStarts||0)+1;let success;const c={onSuccess(fn){success=fn;return c;},onError(){return c;},onClose(){return c;},onNextReady(fn){queueMicrotask(fn);return c;},showCaptcha(){success();},getValidate(){return {lot_number:crypto.randomUUID().replaceAll('-',''),testPassed:true};},destroy(){}};callback(c);};});
    const page=await context.newPage();
    await page.goto(origin+'/');
    await page.evaluate(()=>localStorage.setItem('wedding.blessings.name',JSON.stringify('先前的称呼')));
    await page.goto(origin+'/game.html');await page.locator('#gameLogin').waitFor();
    assert.equal(await page.locator('[name=name]').inputValue(),'先前的称呼');
    assert.equal(await page.locator('[name=name]').isVisible(),false);
    assert.equal(await page.locator('.game-page-header,h1,.game-facts,#gameFeedback').count(),0);
    await page.locator('#showGameRules').click();await page.locator('dialog[open]').waitFor();
    assert.ok(await page.locator('.dialog-content h3').count()>=5);
    assert.match(await page.locator('.dialog-content').innerText(),/6 道题.*2 题/s);
    await page.locator('.dialog-primary').click();
    await page.locator('[name=phone]').fill('13900000777');await page.locator('#getGameCode').click();
    await page.locator('dialog[data-kind=consent][open]').waitFor();
    assert.equal(g.sms.calls.length,0);assert.equal(await page.evaluate(()=>window.captchaStarts||0),0);
    await page.locator('.dialog-secondary').click();assert.equal(await page.locator('[name=consent]').isChecked(),false);
    await page.locator('#getGameCode').click();await page.locator('.dialog-primary').click();
    await waitFor(()=>g.sms.calls.length===1);assert.equal(await page.locator('[name=consent]').isChecked(),true);
    await page.locator('.game-known-name button').click();await page.locator('[name=name]').fill('注册的新称呼');
    const actualCode=g.codes.get('+8613900000777');
    await page.locator('[name=code]').fill(actualCode==='000000'?'111111':'000000');await page.getByRole('button',{name:'开启默契挑战',exact:true}).click();
    await page.locator('dialog[open]').waitFor();assert.match(await page.locator('.dialog-content').innerText(),/验证码/);await page.locator('.dialog-primary').click();
    await page.locator('[name=code]').fill(actualCode);await page.getByRole('button',{name:'开启默契挑战',exact:true}).click();await page.locator('#gameAnswer').waitFor();
    assert.equal(await page.locator('.game-chat-host').count(),1);
    assert.match(await page.locator('.game-paper').evaluate(node=>getComputedStyle(node).backdropFilter),/blur/);
    await page.locator('#backToInvitation').click();await page.locator('#preloaderOverlay[data-state=ready]').waitFor();await page.locator('#btnEnterInvitation').click();await page.locator('#blessingEntry').click();
    assert.equal(await page.locator('#blessingName').inputValue(),'注册的新称呼');assert.equal(await page.locator('#blessingName').getAttribute('readonly'),'');
    await page.locator('.blessing-ai-write:not([hidden])').waitFor();assert.match(await page.locator('.blessing-ai-write').innerText(),/写一句/);
    await page.locator('.blessing-ai-write').click();await page.waitForFunction(()=>document.querySelector('#blessingMessage').value==='愿你们岁岁相伴，年年欢喜。');
    assert.equal((await b.db.query('SELECT count(*)::int AS count FROM wedding_blessings WHERE room_id=$1',[b.config.room])).rows[0].count,0,'AI生成不会发送祝福');
    delayed=true;await page.locator('#blessingMessage').fill('愿你们幸福');await page.locator('.blessing-ai-write').click();await waitFor(()=>Boolean(release));
    await page.locator('#blessingMessage').fill('我刚写的新祝福');release();
    await page.locator('dialog[open]').waitFor();await page.locator('.dialog-secondary').click();
    assert.equal(await page.locator('#blessingMessage').inputValue(),'我刚写的新祝福');assert.equal(writingCalls.length,2);
    await page.locator('#blessingsModal .modal-close').click();await page.locator('.nav-dot[data-index="3"]').click();
    await page.waitForFunction(()=>document.querySelector('.page-4.active')&&document.querySelector('#swiperWrapper').dataset.transition==='idle');
    await page.locator('#gameEntry:not([hidden])').waitFor();
    for(const [width,height]of[[320,568],[390,844]]){
      await page.setViewportSize({width,height});
      const layout=await page.evaluate(()=>{const bounds=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,width:r.width};};return {entry:bounds('#gameEntry'),dock:bounds('.blessing-dock'),hint:bounds('#gameEntryHint'),blur:getComputedStyle(document.querySelector('.blessing-quick-gifts')).backdropFilter};});
      assert.ok(layout.entry.width>=44&&layout.entry.right<=width);assert.ok(layout.entry.x>=layout.dock.right+4);assert.ok(layout.hint.bottom<layout.entry.y);assert.match(layout.blur,/blur/);
    }
  }finally{release?.();await browser?.close();await g.close();await b.close();}
});
