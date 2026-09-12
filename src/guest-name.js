const aliasKey='wedding.blessings.name', profileKey='wedding.guest.profile';
let registered=null;
function read(key) { try{return JSON.parse(localStorage.getItem(key));}catch{return null;} }
function clean(value) { return typeof value==='string'&&value.trim()&&[...value.trim()].length<=24?value.trim().normalize('NFC'):''; }
export function registeredGuestName() { return clean(read(profileKey)?.name) || registered?.name || ''; }
export function guestName() { return registeredGuestName() || clean(read(aliasKey)); }
export function rememberGuestName(value) {
  const name=registeredGuestName() || clean(value);if(!name)return;
  try{localStorage.setItem(aliasKey,JSON.stringify(name));}catch{ /* 当前输入仍可发送。 */ }
  window.dispatchEvent(new Event('wedding-guest-name-change'));
}
export function rememberRegisteredGuest(participant) {
  const name=clean(participant?.name);if(!name)return;
  registered={id:participant.id,name};
  try{localStorage.setItem(profileKey,JSON.stringify({id:participant.id,name}));localStorage.setItem(aliasKey,JSON.stringify(name));}catch{ /* 服务端身份不依赖本地存储。 */ }
  window.dispatchEvent(new Event('wedding-guest-name-change'));
}
export async function refreshRegisteredGuest() {
  try { const response=await fetch('/api/game/me',{cache:'no-store',signal:AbortSignal.timeout(5000)});if(response.ok){const data=await response.json();rememberRegisteredGuest(data.participant);} } catch { /* 身份读取不阻止祝福入口；已有称呼继续使用。 */ }
}
export function watchGuestName(listener,signal) {
  window.addEventListener('storage',event=>{if(event.key===profileKey||event.key===aliasKey)listener(guestName());},{signal});
  for(const event of ['pageshow','wedding-guest-name-change'])window.addEventListener(event,()=>listener(guestName()),{signal});
}
