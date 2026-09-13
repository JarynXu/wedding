import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { gameFixture,gameTestDatabase } from './game-fixture.mjs';

test('先读邀请再参加，取消回到请柬，姓名标题和规则导航保持一致',{skip:!gameTestDatabase&&'需要隔离数据库',timeout:60000},async()=>{
  const f=await gameFixture(),require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  try{
    const origin=await f.server();
    for(const theme of ['classic','chinese']){
      const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(origin+'/?theme='+theme);await page.locator('#preloaderOverlay[data-state=ready]').waitFor();await page.locator('#btnEnterInvitation').click();
      await page.locator('.nav-dot[data-index="3"]').click();await page.locator('.page-4.active').waitFor();await page.locator('#gameEntry').click();
      const frame=page.frameLocator('.invitation-game-layer iframe');await frame.locator('dialog[data-kind=game-intro][open]').waitFor();
      assert.equal(await frame.locator('#gameLogin').count(),0);assert.equal(f.sms.calls.length,0);
      assert.equal((await f.pool.query('SELECT count(*)::int AS count FROM wedding_game_chat_turns WHERE room_id=$1',[f.room])).rows[0].count,0);
      assert.doesNotMatch(await frame.locator('.game-introduction').innerText(),/免责声明|实物为准|数据库|阿里云|30天/);
      await page.setViewportSize({width:320,height:568});
      const fit=await frame.locator('dialog[open]').evaluate(dialog=>{const r=dialog.getBoundingClientRect(),button=dialog.querySelector('.dialog-primary').getBoundingClientRect();return {top:r.top,bottom:r.bottom,buttonBottom:button.bottom,height:innerHeight};});
      assert.ok(fit.top>=0&&fit.bottom<=fit.height&&fit.buttonBottom<=fit.height);await page.setViewportSize({width:390,height:844});
      if(process.env.WEDDING_QA_DIR)await page.screenshot({path:process.env.WEDDING_QA_DIR+'/challenge-intro-'+theme+'.png',animations:'disabled'});
      await frame.getByRole('button',{name:'先逛逛',exact:true}).click();await page.locator('.invitation-game-layer[open]').waitFor({state:'hidden'});
      assert.equal(await page.locator('.page.active').getAttribute('data-index'),'3');assert.equal(await page.locator('#bgm').evaluate(audio=>audio.paused),false);
      await page.locator('#gameEntry').click();await frame.locator('dialog[data-kind=game-intro][open]').waitFor();await frame.getByRole('button',{name:'我来试试',exact:true}).click();await frame.locator('#gameLogin').waitFor();
      assert.equal(await frame.locator('#gameViewTitle').innerText(),'喜宴司仪');
      await frame.locator('#gameMenuToggle').click();await frame.locator('#showGameRules').click();await frame.locator('.game-rules-page').waitFor();assert.equal(await frame.locator('dialog[open]').count(),0);
      await frame.locator('#backToInvitation').click();await frame.locator('#gameLogin').waitFor();
      await frame.locator('#backToInvitation').click();await page.locator('.invitation-game-layer[open]').waitFor({state:'hidden'});await page.locator('#gameEntry').click();await frame.locator('#gameLogin').waitFor();assert.equal(await frame.locator('dialog[open]').count(),0);
      assert.deepEqual(errors,[]);await page.close();
    }
    await f.pool.query("UPDATE wedding_games SET config=jsonb_set(config,'{closesAt}',to_jsonb((clock_timestamp()-interval '1 minute')::text)) WHERE room_id=$1",[f.room]);
    const ended=await browser.newPage();await ended.goto(origin+'/game.html');await ended.locator('dialog[data-kind=game-intro][open]').waitFor();
    assert.match(await ended.locator('.game-introduction').innerText(),/答题已经结束/);assert.equal(await ended.getByRole('button',{name:'去看看',exact:true}).count(),1);await ended.close();
  }finally{await browser.close();await f.close();}
});
