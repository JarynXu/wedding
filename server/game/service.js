import pg from 'pg';
import { GameError } from './model.js';
import { GameSecrets } from './secrets.js';
import { GameStore } from './store.js';
import { GameIdentity } from './identity.js';
import { AliyunGameSms } from './sms.js';
import { AliyunGameCaptcha } from './captcha.js';
import { GameJudge } from './judge.js';

/** 活动持久化与判题工作由服务拥有；判题租约可由其他实例恢复。 */
export function createGameService({ database, room, runtime, sms = new AliyunGameSms(runtime?.sms), captcha = new AliyunGameCaptcha(runtime?.captcha), judge = new GameJudge(runtime?.ai) }) {
  if (!runtime) return null;
  if (!database) throw new Error('游戏需要已配置的请柬数据库');
  const pool = new pg.Pool({ ...database, application_name: 'wedding-game' });
  pool.on('error', error => console.error('游戏数据库连接中断', error.code || error.name));
  const secrets = new GameSecrets(runtime), store = new GameStore(pool, room, secrets), identity = new GameIdentity(pool, room, secrets, sms, runtime,captcha);
  const jobs = new Set(); let initializing, ticking = false, stopped = false, closing, loggedFailure = false;
  const integrations = { sms: { configured: sms.configured }, captcha:{configured:captcha.configured}, ai: { configured: judge.configured } };
  async function ensure() {
    if (stopped) throw new GameError('UNAVAILABLE', '游戏服务正在重启', 503);
    if (store.initialized) return;
    initializing ??= store.initialize().finally(() => { initializing = null; });
    await initializing;
  }
  async function tick() {
    if (stopped || ticking) return;
    ticking = true;
    try {
      await ensure(); loggedFailure = false;
      if (!judge.configured) return;
      while (jobs.size < 3 && !stopped) {
        const answer = await store.claimJob(); if (!answer || stopped) break;
        const job = { controller: new AbortController() }; jobs.add(job);
        job.promise = (async () => {
          try { const result = await judge.grade(answer, job.controller.signal); if (!stopped) await store.finishJob(answer, result); }
          catch (error) { console.error('游戏判题未完成', error.code || error.name); }
          finally { jobs.delete(job); }
        })();
      }
    } catch (error) { if (!loggedFailure) console.error('游戏服务尚未就绪', error.code || error.name); loggedFailure = true; }
    finally { ticking = false; }
  }
  const timer = setInterval(tick, 2000); timer.unref(); tick();
  return { store, identity, integrations, runtime, ensure, tick,
    close() {
      closing ??= (async () => { stopped = true; clearInterval(timer); for (const job of jobs) job.controller.abort(); await Promise.allSettled([...jobs].map(job => job.promise)); await initializing?.catch(() => {}); await pool.end(); })();
      return closing;
    },
  };
}
