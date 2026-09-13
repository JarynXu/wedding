import { answerReply } from '../../src/game-voice.js';

export const REPLY_VERSION = 2;

/** 旧发言按已保存的判定与题目恢复；原始模型输出仍留在数据库供追溯。 */
export function guestReply(row, answers, questions) {
  if (!row.reply) return null;
  const reply = structuredClone(row.reply);
  if (reply.retryable) return reply;
  const answer = answers.find(item => item.id === reply.answerId);
  if (!answer) return reply;
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
