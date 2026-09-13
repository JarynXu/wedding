import { answerReply } from '../../src/game-voice.js';
import { announcesAnswerResult } from './suggestions.js';

export const REPLY_VERSION = 2;

/** 旧发言按已保存的判定与题目恢复；原始模型输出仍留在数据库供追溯。 */
export function guestReply(row, answers, questions) {
  if (!row.reply) return null;
  const reply = structuredClone(row.reply);
  if (reply.retryable) return reply;
  const answer = answers.find(item => item.id === reply.answerId);
  if (!answer) {
    const clean=reply.messages.filter(value=>/^你目前答对 \d+ 题/.test(value)||!announcesAnswerResult(value));
    if(clean.length!==reply.messages.length){
      reply.messages=clean.length?clean:[answers.some(item=>item.questionId===row.question_id)?'这道题的选择已记下。':'刚才没能记下这次选择，请再选一次。'];
      reply.source='template';
    }
    return reply;
  }
  const legacy = reply.presentationVersion !== REPLY_VERSION;
  if (!legacy && (!answer || (answer.version === reply.answerVersion && answer.status === reply.answerStatus))) return reply;
  const next = reply.questionText ? questions.find(item => item.id === reply.questionId)?.title : null;
  if (answer) {
    reply.messages = [answerReply(answer.status), ...(next ? [next] : [])];
    reply.answerVersion = answer.version;
    reply.answerStatus = answer.status;
    reply.choices = [];
    reply.quickReplies = [];
  }
  reply.questionText = next || null;
  reply.presentationVersion = REPLY_VERSION;
  reply.source = 'template';
  return reply;
}
