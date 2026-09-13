import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { gameFixture,gameTestDatabase } from './game-fixture.mjs';

test('点选一次即可作答，四个答案收起并保留两条接话建议',{skip:!gameTestDatabase&&'需要隔离数据库',timeout:30000},async()=>{
  const f=await gameFixture(),require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  try{
    const event=await f.store.event();event.config.questions[0]={...event.config.questions[0],title:'宾客几点入场？',answer:'11:30'};
    await f.store.saveConfig({expectedVersion:event.version,config:event.config},'test-admin');
    await f.pool.query("UPDATE wedding_game_question_voice SET deck=$2 WHERE room_id=$1 AND config_version=3 AND question_id='q1'",[f.room,{phrasings:['宾客几点入场？'],hints:['想想午宴之前的时间。'],choices:['11:30','12:28','12:00','11:58'],source:'test'}]);
    const origin=await f.server(),person=await f.participant(103),context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await context.addCookies([{name:'wedding_game',value:person.token,url:origin}]);
    const page=await context.newPage();const sent=[];page.on('request',request=>{if(request.url().endsWith('/conversation/messages'))sent.push(request.postDataJSON());});
    await page.goto(origin+'/game.html?theme=chinese');await page.locator('dialog[data-kind=game-intro][open]').waitFor();await page.getByRole('button',{name:'我来试试',exact:true}).click();
    await page.locator('.conversation-host').filter({hasText:'宾客几点入场'}).waitFor();
    await page.locator('.conversation-quick button').filter({hasText:'给几个选项'}).click();await page.locator('.conversation-choices button').first().waitFor();assert.equal(await page.locator('.conversation-choices button').count(),4);
    await page.locator('.conversation-choices button').first().click();await page.locator('.conversation-host').filter({hasText:'隔离测试题 2'}).waitFor();
    assert.equal(sent.at(-1).choice.index,0);assert.match(sent.at(-1).choice.offerId,/^\d+$/);
    assert.equal((await f.store.participant(person.participantId)).participant.score,1);assert.equal(await page.locator('.conversation-choices button').count(),0);assert.equal(await page.locator('.conversation-quick button').count(),2);
    const layout=await page.evaluate(()=>{const scroll=document.querySelector('.conversation-log'),paper=document.querySelector('.game-paper');return {gap:paper.getBoundingClientRect().right-scroll.getBoundingClientRect().right,padding:parseFloat(getComputedStyle(scroll).paddingRight)};});
    assert.ok(layout.gap>=6&&layout.gap<=10);assert.ok(layout.padding>=20);
    if(process.env.WEDDING_QA_DIR)await page.screenshot({path:process.env.WEDDING_QA_DIR+'/choice-once-chinese.png',animations:'disabled'});
  }finally{await browser.close();await f.close();}
});
