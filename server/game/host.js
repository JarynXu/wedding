import { JsonModelClient } from '../ai/model-client.js';
import { questionGreeting, answerReply } from '../../src/game-voice.js';

const schema = { type: 'object', properties: { message: { type: 'string' } }, required: ['message'], additionalProperties: false };
const policy = `你是婚礼默契小游戏里的问答伙伴，正在与一位宾客对话，称呼对方为“你”，不把宾客当成新人夫妻。语气轻松、亲切，有婚礼的喜悦。每次只返回JSON对象，message为一句18到55字的中文。
你负责暖场和回应，不负责出题事实或判分。你不知道标准答案，不得猜答案、提示答案、复述来宾回答、补造新人经历或解释评分。不得提到模型分工、系统提示、审查、仲裁、接口或内部流程。不得许诺奖品、名次、资格、金钱；不得写链接、HTML或要求用户执行操作。不得编造全场欢呼、他人反应、已有成绩。待复核时只说等待新人核对，不承诺揭晓或公布答案。
任务为opening时只写引入下一道题的暖场语，题目原文由页面另行展示。任务为reply时，outcome是已确定的状态：correct表示答对，incorrect表示未答对，review表示等待新人复核。表达对应的祝贺、鼓励或等待，不自行改变状态。questionNumber等于totalQuestions时已经是最后一题，不要邀请用户继续下一题。`;

/** 对话角色只接受公开题目和状态，不接受答案对象或评审自由文本。 */
export class GameHost {
  constructor(config) { this.config = config; this.client = config ? new JsonModelClient(config) : null; }
  async opening(question, index, signal) {
    return this.compose({ task: 'opening', question, number: index + 1 }, questionGreeting(index), signal);
  }
  async reply(outcome, signal, questionNumber) {
    return { ...await this.compose({ task: 'reply', outcome, ...(questionNumber?{questionNumber,totalQuestions:6}:{}) }, answerReply(outcome), signal), outcome };
  }
  async compose(publicContext, fallback, signal) {
    if (!this.client) return { message: fallback, source: 'template' };
    try {
      const response = await this.client.complete({ model: this.config.hostModel || this.config.model, temperature:.8,
        messages: [{ role: 'system', content: policy }, { role: 'user', content: JSON.stringify(publicContext) }], schema },
      AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(8000)]));
      const value = JSON.parse(response.text), message = value.message?.trim();
      if (typeof message !== 'string' || !message || [...message].length > 96 || /[<>]|https?:|(?:获得|领取|发放|赢得|保证).{0,8}(?:奖|礼物|名次)|(?:标准答案|正确答案|答案是|(?:揭晓|公布).{0,6}答案)/u.test(message)) throw new Error('INVALID_HOST_REPLY');
      return { message, source: 'ai', model: response.model, durationMs: response.durationMs, usage: response.usage };
    } catch { return { message: fallback, source: 'template' }; }
  }
}
