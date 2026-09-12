import pg from 'pg';
import { GameError } from './model.js';
import { GameSecrets } from './secrets.js';
import { GameStore } from './store.js';
import { GameIdentity } from './identity.js';
import { AliyunGameSms } from './sms.js';
import { AliyunGameCaptcha } from './captcha.js';
import { GameJudge } from './judge.js';
import { ConversationStore } from './conversation-store.js';
import { GameConversation } from './conversation.js';
import { ConversationIntent } from './conversation-intent.js';
import { ShowHost } from './show-host.js';
import { QuestionDeck } from './question-deck.js';

/** 活动持久化与判题工作由服务拥有；判题租约可由其他实例恢复。 */
export function createGameService({ database, room, runtime, wedding = {}, sms = new AliyunGameSms(runtime?.sms), captcha = new AliyunGameCaptcha(runtime?.captcha), judge = new GameJudge(runtime?.ai), intent = new ConversationIntent(runtime?.ai), host = new ShowHost(runtime?.ai), deck = new QuestionDeck(runtime?.ai,judge) }) {
  if (!runtime) return null;
  if (!database) throw new Error('游戏需要已配置的请柬数据库');
  const pool = new pg.Pool({ ...database, application_name: 'wedding-game' });
  pool.on('error', error => console.error('游戏数据库连接中断', error.code || error.name));
  const secrets = new GameSecrets(runtime), store = new GameStore(pool, room, secrets), identity = new GameIdentity(pool, room, secrets, sms, runtime,captcha);
  const conversation=new ConversationStore(store),show=new GameConversation({store:conversation,game:store,intent,judge,host,wedding});
  const jobs = new Set(); let initializing, ticking = false, stopped = false, closing, loggedFailure = false;
  let tickFinished=Promise.resolve();
  const integrations = { sms: { configured: sms.configured }, captcha:{configured:captcha.configured}, ai: { configured: judge.configured } };
  async function ensure() {
    if (stopped) throw new GameError('UNAVAILABLE', '暂时没能接上，请稍后再试。', 503);
    if (store.initialized) return;
    initializing ??= store.initialize().finally(() => { initializing = null; });
    await initializing;
  }
  async function tick() {
    if (stopped || ticking) return;
    ticking = true;
    let finishTick;tickFinished=new Promise(resolve=>{finishTick=resolve;});
    try {
      await ensure(); loggedFailure = false;
      if (!judge.configured) return;
      while (jobs.size < (runtime.workers||8) && !stopped) {
        const turn=await conversation.claim();
        const answer = !turn?await store.claimJob():null;
        const voice = !turn&&!answer ? await store.claimQuestionVoice() : null;
        if ((!turn && !answer && !voice) || stopped) {if(turn&&stopped)await conversation.release(turn);break;}
        const job = { controller: new AbortController() }; jobs.add(job);
        job.promise = (async () => {
          try {
            if(turn)await show.process(turn,job.controller.signal);
            else if (answer) { const result = await judge.grade(answer, job.controller.signal, stage => store.updateJobStage(answer, stage)); if (!stopped) await store.finishJob(answer, result); }
            else { const event=await store.event();const question=event.config.questions.find(question=>question.id===voice.question_id);const result = await deck.prepare(question,event.config.judgeInstructions,AbortSignal.any([job.controller.signal,AbortSignal.timeout(70000)])); if (!stopped) await store.finishQuestionVoice(voice, result); }
          }
          catch (error) { console.error('游戏判题未完成', error.code || error.name); }
          finally { if(turn&&stopped)await conversation.release(turn);jobs.delete(job); }
        })();
      }
    } catch (error) { if (!stopped&&!loggedFailure) console.error('游戏服务尚未就绪', error.code || error.name); loggedFailure = true; }
    finally { ticking = false;finishTick(); }
  }
  const timer = setInterval(tick, 2000); timer.unref(); tick();
  return { store, identity, integrations, runtime, conversation, ensure, tick,
    close() {
      closing ??= (async () => { stopped = true; clearInterval(timer); for (const job of jobs) job.controller.abort(); await Promise.allSettled([...jobs].map(job => job.promise)); await tickFinished;await initializing?.catch(() => {}); await pool.end(); })();
      return closing;
    },
  };
}
