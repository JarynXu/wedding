import { gameTransaction } from './persistence.js';
import { integer } from './model.js';

/** 升级未结算活动，保留旧配置与滚动部署读取字段；不修改答卷或已签发奖项。 */
export function upgradePrizePolicy(pool,room) {
  return gameTransaction(pool,room,async client=>{
    const event=(await client.query('SELECT * FROM wedding_games WHERE room_id=$1 FOR UPDATE',[room])).rows[0];
    if(!event||event.settled_at||event.config.prizePolicy==='perfect-six-v1')return {changed:false};
    const participationLimit=integer(event.config.participationLimit??event.config.maxWinners,'参与奖名额',0,500);
    await client.query('INSERT INTO wedding_game_config_history(room_id,version,config,actor) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[room,event.version,event.config,'prize-policy-upgrade']);
    await client.query('UPDATE wedding_games SET config=$2,version=version+1 WHERE room_id=$1',[room,{...event.config,participationLimit,prizePolicy:'perfect-six-v1'}]);
    await client.query(`INSERT INTO wedding_game_question_voice(room_id,config_version,question_id,title,position,result,deck)
      SELECT room_id,$3,question_id,title,position,result,deck FROM wedding_game_question_voice WHERE room_id=$1 AND config_version=$2 ON CONFLICT DO NOTHING`,[room,event.version,event.version+1]);
    return {changed:true,version:event.version+1,participationLimit};
  });
}
