/** 礼物没有价格；数量记录来宾的播放次数，两套主题共享同一祝福簿。 */
export const GIFTS = Object.freeze([
  { id: 'rose', name: '玫瑰', themes: ['classic'], sprite: 0, effect: 'petals' },
  { id: 'champagne', name: '香槟', themes: ['classic'], sprite: 1, effect: 'toast' },
  { id: 'fireworks', name: '烟花', themes: ['classic', 'chinese'], sprite: 2, effect: 'fireworks' },
  { id: 'lantern', name: '喜灯', themes: ['chinese'], sprite: 3, effect: 'lantern' },
  { id: 'knot', name: '同心结', themes: ['chinese'], sprite: 4, effect: 'knot' },
  { id: 'double-happiness', name: '双喜', themes: ['chinese'], sprite: 5, effect: 'seal' },
]);
export const BLESSING_LIMITS = Object.freeze({ name: 24, text: 120, giftCount: 999 });
export const findGift = id => GIFTS.find(gift => gift.id === id) || null;
export const giftsForTheme = theme => GIFTS.filter(gift => gift.themes.includes(theme));
