import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { gameFixture, gameTestDatabase } from './game-fixture.mjs';
import { fixture as blessingsFixture, payload } from './blessings-fixture.mjs';
import { validateBlessing } from '../server/blessings/model.js';

test('手机后台核对、暂停和清空专属测试房间，保留配置并恢复入口', {skip:!gameTestDatabase&&'需要隔离数据库',timeout:45000}, async()=>{
  const f=await gameFixture(),b=await blessingsFixture({BLESSINGS_ROOM:f.room});
  const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
  let browser;
  try{
    const instance=await b.instance(),origin=await f.server({blessings:instance.service});
    await instance.service.store.save(validateBlessing(payload()),'test-network');await f.participant(91);
    browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/admin');await page.locator('#username').fill('test-admin');await page.locator('#password').fill('test-admin-password');await page.locator('#loginButton').click();
    await page.locator('#dashboardView:not([hidden])').waitFor();await page.locator('[data-admin-view=game]').click();
    const panel=page.locator('#roomOperationsPanel');await panel.locator('[data-inspect]').click();
    await panel.locator('[data-summary]').filter({hasText:'祝福和礼物：1'}).waitFor();
    assert.equal(await panel.locator('form').isVisible(),false);
    await panel.locator('[data-pause]').click();await panel.locator('form:not([hidden])').waitFor();
    await panel.locator('[name=confirmation]').fill('清空试运行数据');await panel.locator('[name=password]').fill('test-admin-password');
    if(process.env.WEDDING_QA_DIR)await panel.screenshot({path:process.env.WEDDING_QA_DIR+'/admin-clear-preview.png'});
    await panel.locator('[type=submit]').click();await panel.locator('[role=status]').filter({hasText:'业务记录已清空'}).waitFor();
    assert.equal((await instance.service.store.history()).messages.length,0);
    assert.equal((await f.store.overview(f.integrations)).stats.participants,0);assert.equal((await f.store.event()).config.questions.length,6);
    await panel.locator('[data-pause]').click();await panel.locator('[data-pause]').filter({hasText:'暂停互动'}).waitFor();
    assert.equal((await f.store.event()).published,false,'恢复互动后仍由管理员决定正式开放游戏');
    assert.deepEqual(errors,[]);
  }finally{
    await browser?.close();await b.close();
    await f.pool.query('DELETE FROM wedding_room_operations WHERE room_id=$1',[f.room]);await f.pool.query('DELETE FROM wedding_operation_audit WHERE room_id=$1',[f.room]);await f.close();
  }
});
