const atlas=new URL('../assets/prize-plush.webp',import.meta.url).href;
const gifts={large:{name:'大号毛绒玩偶',box:'40 20 620 700'},medium:{name:'中号毛绒玩偶',box:'690 155 490 540'},small:{name:'小号毛绒玩偶',box:'1230 270 370 430'},keychain:{name:'钥匙扣小玩偶',box:'1690 260 300 440'}};
export function prizeArt(kind){
  const gift=gifts[kind]||gifts.keychain,svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox',gift.box);svg.setAttribute('class','game-prize-art');svg.setAttribute('role','img');svg.setAttribute('aria-label',gift.name+'图示');
  const image=document.createElementNS('http://www.w3.org/2000/svg','image');image.setAttribute('href',atlas);image.setAttribute('width','2055');image.setAttribute('height','765');svg.append(image);return svg;
}
export function prizeName(kind){return gifts[kind]?.name||'';}
