import { publicAssetUrl } from '../static-assets.js';
const portrait = publicAssetUrl('./assets/chinese/portrait.webp');
const hotel = publicAssetUrl('./assets/chinese/hotel.svg');

/** 中式版负责图层与版式，日程、家长身份和交互仍由请柬应用提供。 */
export function applyChineseTheme() {
  const cover = document.getElementById('coverBgPhoto');
  cover.src = portrait;
  cover.alt = '新人身着中式礼服的迎宾合影';
  const frame = document.createElement('div');
  frame.className = 'chinese-cover-frame';
  frame.setAttribute('aria-hidden', 'true');
  document.querySelector('.page-1').append(frame);
  document.getElementById('coverGildedFrame').style.display = 'none';
  document.querySelector('.page-1').classList.remove('has-gilded-frame');
  document.querySelector('.cover-kicker').textContent = 'WE ARE GETTING MARRIED';
  document.querySelector('.cover-dedication').textContent = '执 子 之 手 · 与 子 偕 老';
  document.querySelector('.cover-together').textContent = '';
  const heading = document.createElement('div');
  heading.className = 'chinese-cover-title';
  heading.innerHTML = '<div>吾 家 有 喜</div><p>A HAPPY OCCASION<br>IN OUR FAMILY</p><span aria-hidden="true">囍</span>';
  document.querySelector('.page-1').append(heading);
  const greeting = document.createElement('p');
  greeting.className = 'chinese-cover-blessing';
  greeting.textContent = '良辰吉日 · 永结同心';
  document.querySelector('.page-1').append(greeting);
  document.querySelector('.p3-castle-img').src = hotel;
  document.querySelector('.p3-castle-img').alt = '';

  const dateCaption = document.createElement('p');
  dateCaption.className = 'chinese-caption';
  dateCaption.textContent = '良 辰 吉 日 · 共 赴 白 首';
  document.querySelector('.p2-header-pediment').append(dateCaption);
  const seal = document.createElement('div');
  seal.className = 'chinese-date-seal';
  seal.textContent = '囍';
  seal.setAttribute('aria-hidden', 'true');
  document.querySelector('.p2-date-box').prepend(seal);
  document.querySelector('.cover-welcome-script').textContent = '';
  document.querySelector('.cover-welcome-subtitle').textContent = '';
  document.querySelector('.cover-welcome-message').textContent = '';
}
