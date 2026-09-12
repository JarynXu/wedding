export function readGameRuntime(env = process.env) {
  if (env.GAME_ENABLED && !['true', 'false'].includes(env.GAME_ENABLED)) throw new Error('GAME_ENABLED 须为 true 或 false');
  if (env.GAME_ENABLED !== 'true') return null;
  const dataKey = env.GAME_DATA_KEY;
  if (!dataKey || !/^[a-f\d]{64}$/i.test(dataKey)) throw new Error('GAME_DATA_KEY 须为 32 字节十六进制密钥');
  if (!env.GAME_SESSION_SECRET || env.GAME_SESSION_SECRET.length < 32) throw new Error('GAME_SESSION_SECRET 须为至少 32 字符的随机值');
  const aiFields = [env.GAME_AI_BASE_URL, env.GAME_AI_API_KEY, env.GAME_AI_MODEL, env.GAME_AI_REVIEW_MODEL];
  if (aiFields.some(Boolean) && !aiFields.every(Boolean)) throw new Error('AI 地址、密钥、判题模型和复核模型须一并配置');
  let ai = null;
  if (aiFields.every(Boolean)) {
    const provider=env.GAME_AI_PROVIDER||'openai-compatible';
    if(!['openai-compatible','deepseek'].includes(provider))throw new Error('GAME_AI_PROVIDER 须为 openai-compatible 或 deepseek');
    const url = new URL(env.GAME_AI_BASE_URL);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('GAME_AI_BASE_URL 须为模型 API 基础地址');
    ai = { provider,baseUrl: url.href.replace(/\/$/, ''), key: env.GAME_AI_API_KEY, model: env.GAME_AI_MODEL, reviewModel: env.GAME_AI_REVIEW_MODEL, hostModel: env.GAME_AI_HOST_MODEL || env.GAME_AI_MODEL };
  }
  const smsFields = [env.GAME_ALIYUN_ACCESS_KEY_ID, env.GAME_ALIYUN_ACCESS_KEY_SECRET, env.GAME_SMS_SIGN_NAME, env.GAME_SMS_TEMPLATE_CODE];
  if (smsFields.some(Boolean) && !smsFields.every(Boolean)) throw new Error('阿里云短信认证密钥、签名和模板 Code 须一并配置');
  const sms = smsFields.every(Boolean) ? { accessKeyId:smsFields[0],accessKeySecret:smsFields[1],signName:smsFields[2],templateCode:smsFields[3],schemeName:env.GAME_SMS_SCHEME_NAME||'wedding-game' } : null;
  if(sms&&sms.schemeName.length>20)throw new Error('短信认证方案名不得超过20字符');
  if(Boolean(env.GAME_CAPTCHA_APP_ID)!==Boolean(env.GAME_CAPTCHA_APP_KEY))throw new Error('图形认证 AppID 和 AppKey 须一并配置');
  const captcha=env.GAME_CAPTCHA_APP_ID?{appId:env.GAME_CAPTCHA_APP_ID,appKey:env.GAME_CAPTCHA_APP_KEY}:null;
  const dailyLimit = Number(env.GAME_SMS_DAILY_LIMIT || 300);
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 5000) throw new Error('GAME_SMS_DAILY_LIMIT 须为 1–5000');
  const workers=Number(env.GAME_AI_CONCURRENCY||8);if(!Number.isInteger(workers)||workers<1||workers>32)throw new Error('GAME_AI_CONCURRENCY 须为 1–32');
  return { dataKey: Buffer.from(dataKey, 'hex'), sessionSecret: env.GAME_SESSION_SECRET, ai, sms, captcha, dailyLimit, workers, cookieSecure: env.NODE_ENV === 'production' };
}
