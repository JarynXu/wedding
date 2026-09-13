import { createInvitationApp } from '../server/app.js';
import { readBlessingsConfig } from '../server/blessings/config.js';
import { createBlessingsService } from '../server/blessings/service.js';
import { readGameRuntime } from '../server/game/config.js';
import { createGameService } from '../server/game/service.js';
import { publicWeddingFacts } from '../server/game/public-context.js';
import { WEDDING_CONFIG } from '../src/config.js';

const config=readBlessingsConfig(),runtime=readGameRuntime();
if(new URL(config.database.connectionString).hostname!=='127.0.0.1'||!config.room.startsWith('game-test-'))throw Error('仅允许本机隔离压测');
const game=createGameService({database:config.database,room:config.room,runtime,wedding:publicWeddingFacts(WEDDING_CONFIG)}),blessings=createBlessingsService(config);
const server=createInvitationApp({game,blessings,gameOrigin:config.origin}).listen(0,'127.0.0.1',()=>process.send?.({port:server.address().port}));
let stopping=false;
async function close(){if(stopping)return;stopping=true;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await Promise.allSettled([game.close(),blessings.close()]);process.exit(0);}
process.on('message',message=>{if(message==='stop')close();});process.on('SIGTERM',close);
