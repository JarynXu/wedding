import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { gameFixture,gameTestDatabase,adminLogin,gameRequest } from './game-fixture.mjs';
import { waitFor } from './blessings-fixture.mjs';
const require=createRequire(import.meta.url);

test('宾客手机验证码、六题、榜单与兑奖凭据，使用隔离短信替身',{skip:!gameTestDatabase&&'需要隔离 PostgreSQL',timeout:90000},async()=>{
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
  const f=await gameFixture();const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  try {
    const origin=await f.server(),adminCookie=await adminLogin(origin),errors=[];
    let winner;
    for(const [theme,width,index] of [['classic',390,1],['chinese',320,2]]){
      const page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true});page.on('pageerror',error=>errors.push(error.message));
      await page.addInitScript(()=>{window.initAlicom4=(_options,callback)=>{let success;const instance={onSuccess(fn){success=fn;return this;},onError(){return this;},onClose(){return this;},onNextReady(fn){queueMicrotask(fn);return this;},showCaptcha(){success();},getValidate(){return {lot_number:crypto.randomUUID().replaceAll('-',''),captcha_output:'test',pass_token:'test',gen_time:String(Math.floor(Date.now()/1000)),testPassed:true};},destroy(){}};callback(instance);};});
      const phone=String(13900000000+index);
      await page.goto(origin+'/game.html?theme='+theme);await page.locator('#gameLogin').waitFor();
      await page.locator('[name=name]').fill('隔离测试来宾'+index);await page.locator('[name=phone]').fill(phone);
      await page.locator('[name=consent]').check();
      await page.locator('#getGameCode').click();await waitFor(()=>f.codes.has('+86'+phone));
      await page.locator('[name=code]').fill(f.codes.get('+86'+phone));
      if(process.env.WEDDING_QA_DIR)await page.screenshot({path:join(process.env.WEDDING_QA_DIR,`game-${theme}-login.png`)});
      await page.getByRole('button',{name:'开启默契挑战',exact:true}).click();await page.locator('#gameAnswer').waitFor();
      let dropped=false;
      await page.route('**/api/game/answers',async route=>{if(!dropped){dropped=true;await route.fetch();await route.abort();}else await route.continue();});
      await page.locator('#gameAnswer').fill('第一份隔离测试回答');await page.getByRole('button',{name:'提交回答',exact:true}).click();
      await page.locator('.game-my-answer').waitFor({timeout:12000});
      const count=await f.pool.query('SELECT count(*)::int AS count FROM wedding_game_answers WHERE room_id=$1 AND text=$2',[f.room,'第一份隔离测试回答']);
      assert.equal(count.rows[0].count,index,'后台确认丢失响应后，前台可从个人记录恢复');
      await page.unroute('**/api/game/answers');
      for(let q=2;q<=6;q++){
        await page.getByRole('button',{name:'继续下一题',exact:true}).click();
        await page.locator('#gameAnswer').fill(`第${q}份隔离测试回答`);await page.getByRole('button',{name:'提交回答',exact:true}).click();await page.locator('.game-my-answer').waitFor();
      }
      const records=(await f.pool.query('SELECT a.* FROM wedding_game_answers a JOIN wedding_game_participants p ON p.id=a.participant_id WHERE a.room_id=$1 AND p.phone_last4=$2 ORDER BY a.id',[f.room,phone.slice(-4)])).rows;
      assert.equal(records.length,6);
      for(const answer of records){const response=await gameRequest(origin,'/admin/api/game/review/'+answer.id,{expectedVersion:answer.version,verdict:'correct',reason:'隔离测试人工判定'},adminCookie);assert.equal(response.status,200);}
      await page.waitForFunction(()=>document.querySelector('.game-score strong')?.textContent==='6',{timeout:12000});
      const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.body.scrollWidth,inputSize:getComputedStyle(document.querySelector('.game-my-answer')).fontSize,buttons:[...document.querySelectorAll('.game-question-number')].map(button=>button.getBoundingClientRect().width)}));
      assert.ok(layout.scroll<=layout.width);assert.ok(layout.buttons.every(w=>w>=44));
      if(process.env.WEDDING_QA_DIR)await page.screenshot({path:join(process.env.WEDDING_QA_DIR,`game-${theme}-score.png`),fullPage:true});
      await page.locator('[data-game-tab=board]').click();await page.locator('.game-leaderboard li').first().waitFor();assert.match(await page.locator('.game-board-note').innerText(),/暂定/);
      const sentCount=f.sms.calls.length;await page.reload();await page.locator('.game-score').waitFor();assert.equal(f.sms.calls.length,sentCount,'已有30天会话时刷新不再发验证码');
      if(index===1)winner=page;
      else await page.close();
    }
    const cutoff=(await f.pool.query('SELECT clock_timestamp() AS now')).rows[0].now.toISOString();await f.pool.query("UPDATE wedding_games SET config=jsonb_set(config,'{closesAt}',to_jsonb($2::text)) WHERE room_id=$1",[f.room,cutoff]);
    const preview=await(await gameRequest(origin,'/admin/api/game/settlement-preview',undefined,adminCookie)).json();assert.equal(preview.ready,true);
    const settlement=await gameRequest(origin,'/admin/api/game/settle',{expectedVersion:preview.configVersion,previewToken:preview.previewToken,confirmed:true},adminCookie);assert.equal(settlement.status,200);assert.equal((await settlement.json()).awarded,2);
    await winner.locator('[data-game-tab=play]').click();await winner.locator('.game-claim-code').waitFor({timeout:12000});
    const code=(await winner.locator('.game-claim-code').innerText()).replaceAll('-','');assert.match(code,/^[A-F0-9]{20}$/);
    const check=await(await gameRequest(origin,'/admin/api/game/redemption/check',{code},adminCookie)).json();assert.equal(check.status,'issued');
    const redemption=await gameRequest(origin,'/admin/api/game/redemption',{code,requestId:crypto.randomUUID()},adminCookie);assert.equal(redemption.status,200);
    await winner.getByText('这份心意已经领取',{exact:true}).waitFor({timeout:12000});
    if(process.env.WEDDING_QA_DIR)await winner.screenshot({path:join(process.env.WEDDING_QA_DIR,'game-redeemed.png'),fullPage:true});
    assert.deepEqual(errors,[]);
  } finally {await browser.close();await f.close();}
});
