import { GameError, text, integer } from './model.js';

/** 婚礼公开资料独立于计分题库；修改资料不重判答案，也不改变奖项。 */
export class GameKnowledge {
  constructor(game) { this.game=game; this.pool=game.pool; this.room=game.room; }
  async read(client=this.pool) {
    const row=(await client.query('SELECT version,config,updated_at FROM wedding_game_knowledge WHERE room_id=$1',[this.room])).rows[0];
    return row?{version:row.version,...row.config,updatedAt:row.updated_at}:{version:0,enabled:false,entries:[],updatedAt:null};
  }
  async forHost() { const value=await this.read(); return value.enabled?value.entries:[]; }
  async save(body,actor) {
    integer(body.expectedVersion,'资料版本',0,2147483647);
    if(typeof body.enabled!=='boolean'||!Array.isArray(body.entries)||body.entries.length>12)throw new GameError('INVALID_INPUT','最多填写12条公开资料');
    const entries=body.entries.map(entry=>({question:text(entry.question,'现场问题',160),answer:text(entry.answer,'公开回答',600),teaser:text(entry.teaser||'','彩蛋引子',100,true)}));
    return this.game.transaction(async client=>{
      const current=await this.read(client);
      if(current.version!==body.expectedVersion)throw new GameError('VERSION_CONFLICT','资料已被修改，请刷新后查看',409);
      await client.query(`INSERT INTO wedding_game_knowledge(room_id,version,config,updated_by) VALUES($1,1,$2,$3)
        ON CONFLICT(room_id) DO UPDATE SET version=wedding_game_knowledge.version+1,config=excluded.config,updated_by=excluded.updated_by,updated_at=clock_timestamp()`,[this.room,{enabled:body.enabled,entries},actor]);
      return this.read(client);
    });
  }
}
