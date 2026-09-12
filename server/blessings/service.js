import { BlessingStore } from './store.js';
import { BlessingHub } from './hub.js';
import { BlessingError } from './model.js';

export function createBlessingsService(config, { writing = null } = {}) {
  if (!config) return null;
  const store = new BlessingStore(config);
  const hub = new BlessingHub(store, config);
  const streams = new Set();
  hub.start();
  let closing;
  const writingJobs=new Set();
  return {
    config, store, hub, streams, writing,
    async write(message,network) {
      if(closing||!writing?.configured)throw new BlessingError('AI_UNAVAILABLE','AI写祝福正在准备中',503);
      const work=(async()=>{
        const prior=await store.beginWriting(message,network);if(prior.result)return {text:prior.result};
        let result;
        try{result=await writing.compose(message.text,message.theme);}catch(error){await store.finishWriting(message.requestId,null);throw error;}
        await store.finishWriting(message.requestId,result);return {text:result};
      })();
      writingJobs.add(work);try{return await work;}finally{writingJobs.delete(work);}
    },
    close() {
      closing ??= (async () => { writing?.close?.();await Promise.allSettled([...writingJobs]);await hub.close(); for (const close of streams) close(); await store.close(); })();
      return closing;
    },
  };
}
