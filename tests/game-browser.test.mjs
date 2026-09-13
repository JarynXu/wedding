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
      await page.goto(origin+'/game.html?theme='+theme);await page.locator('.game-rules-page').waitFor();await page.getByRole('button',{name:'开始挑战',exact:true}).click();await page.locator('#gameLogin').waitFor();
      await page.locator('[name=name]').fill('隔离测试来宾'+index);await page.locator('[name=phone]').fill(phone);
      await page.locator('[name=consent]').check();
      await page.locator('#getGameCode').click();await waitFor(()=>f.codes.has('+86'+phone));
      await page.locator('[name=code]').fill(f.codes.get('+86'+phone));
      if(process.env.WEDDING_QA_DIR)await page.screenshot({path:join(process.env.WEDDING_QA_DIR,`game-${theme}-login.png`)});
      await page.getByRole('button',{name:'请喜宴司仪开场',exact:true}).click();await page.locator('#gameAnswer').waitFor();
      await page.locator('.conversation-host').filter({hasText:'隔离测试题 1'}).waitFor();
      assert.equal(await page.locator('.game-question-nav,.game-question-number,.game-score,.game-verdict').count(),0);
      const say=async value=>{await page.locator('#gameAnswer').fill(value);await page.getByRole('button',{name:'发送',exact:true}).click();};
      await say('我答对几题了？');await page.locator('.conversation-host').filter({hasText:'答对 0 题'}).waitFor();
      let dropped=false;
      await page.route('**/api/game/conversation/messages',async route=>{if(!dropped){dropped=true;await route.fetch();await route.abort();}else await route.continue();});
      await say('测试答案 1');
      await page.locator('dialog[open]').waitFor();await page.locator('.dialog-primary').click();
      await page.locator('.conversation-host').filter({hasText:'隔离测试题 2'}).waitFor();
      const count=await f.pool.query('SELECT count(*)::int AS count FROM wedding_game_answers WHERE room_id=$1 AND text=$2',[f.room,'测试答案 1']);
      assert.equal(count.rows[0].count,index,'丢失响应不重复计分');
      assert.equal(await page.locator('.conversation-guest').filter({hasText:'测试答案 1'}).count(),1);
      await page.unroute('**/api/game/conversation/messages');
      for(let q=2;q<=6;q++){
        await say(`测试答案 ${q}`);
        if(q<6)await page.locator('.conversation-host').filter({hasText:`隔离测试题 ${q+1}`}).waitFor();
        else await waitFor(async()=>Number((await f.pool.query('SELECT count(*) FROM wedding_game_answers a JOIN wedding_game_participants p ON p.id=a.participant_id WHERE a.room_id=$1 AND p.phone_last4=$2',[f.room,phone.slice(-4)])).rows[0].count)===6);
      }
      await page.locator('.conversation-typing:not([hidden])').waitFor({state:'hidden'});
      await say('我现在答对几题了？');await page.locator('.conversation-host').filter({hasText:'答对 6 题'}).waitFor();
      assert.ok(await page.locator('.conversation-host').count()>10,'上下文保留为连续聊天');
      assert.ok(await page.evaluate(()=>document.body.scrollWidth<=innerWidth));
      if(process.env.WEDDING_QA_DIR)await page.screenshot({path:join(process.env.WEDDING_QA_DIR,`game-${theme}-conversation.png`),animations:'disabled'});
      await page.locator('#gameMenuToggle').click();await page.locator('[data-game-tab=board]').click();await page.locator('.game-leaderboard li').first().waitFor();assert.equal(await page.locator('#gameBoardPhase').innerText(),'暂定');assert.equal(await page.locator('.game-personal-prize strong').innerText(),index===1?'大号毛绒玩偶':'中号毛绒玩偶');if(process.env.WEDDING_QA_DIR)await page.screenshot({path:join(process.env.WEDDING_QA_DIR,'prize-board-'+theme+'.png'),animations:'disabled'});await page.locator('#backToInvitation').click();await page.locator('#gameAnswer').waitFor();
      const sentCount=f.sms.calls.length;await page.reload();await page.locator('.conversation-host').filter({hasText:'答对 6 题'}).waitFor();assert.equal(f.sms.calls.length,sentCount);
      if(index===1)winner=page;
      else await page.close();
    }
    const cutoff=(await f.pool.query('SELECT clock_timestamp() AS now')).rows[0].now.toISOString();await f.pool.query("UPDATE wedding_games SET config=jsonb_set(config,'{closesAt}',to_jsonb($2::text)) WHERE room_id=$1",[f.room,cutoff]);
    const preview=await(await gameRequest(origin,'/admin/api/game/settlement-preview',undefined,adminCookie)).json();assert.equal(preview.ready,true);
    const settlement=await gameRequest(origin,'/admin/api/game/settle',{expectedVersion:preview.configVersion,previewToken:preview.previewToken,confirmed:true},adminCookie);assert.equal(settlement.status,200);assert.equal((await settlement.json()).awarded,2);
    await winner.locator('.conversation-claim:not([hidden])').waitFor({timeout:12000});await winner.locator('.conversation-claim').click();await winner.locator('.game-claim-code').waitFor();
    const code=(await winner.locator('.game-claim-code').innerText()).replaceAll('-','');assert.match(code,/^[A-F0-9]{20}$/);
    const check=await(await gameRequest(origin,'/admin/api/game/redemption/check',{code},adminCookie)).json();assert.equal(check.status,'issued');
    const redemption=await gameRequest(origin,'/admin/api/game/redemption',{code,requestId:crypto.randomUUID()},adminCookie);assert.equal(redemption.status,200);
    await winner.getByText('这份心意已经领取',{exact:true}).waitFor({timeout:12000});
    if(process.env.WEDDING_QA_DIR)await winner.screenshot({path:join(process.env.WEDDING_QA_DIR,'game-redeemed.png'),fullPage:true,animations:'disabled'});
    assert.deepEqual(errors,[]);
  } finally {await browser.close();await f.close();}
});
