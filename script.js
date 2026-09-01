(() => {
  const scenes=[...document.querySelectorAll('.scene')];
  const progress=document.getElementById('progress');
  const musicBtn=document.getElementById('musicBtn');
  const bgm=document.getElementById('bgm');
  const toast=document.getElementById('toast');
  let index=0, locked=false, touchY=null, toastTimer;

  function show(i){
    const next=Math.max(0,Math.min(scenes.length-1,i));
    if(next===index) return;
    index=next;
    scenes.forEach((s,n)=>{
      s.classList.toggle('is-active',n===index);
      s.classList.toggle('is-before',n<index);
      s.classList.toggle('is-after',n>index);
      s.setAttribute('aria-hidden',n===index?'false':'true');
    });
    progress.style.width=((index+1)/scenes.length*100)+'%';
    history.replaceState(null,'','#'+(index+1));
  }
  function step(d){if(locked)return;locked=true;show(index+d);setTimeout(()=>locked=false,760)}
  addEventListener('wheel',e=>{if(Math.abs(e.deltaY)>12){e.preventDefault();step(e.deltaY>0?1:-1)}},{passive:false});
  addEventListener('keydown',e=>{if(['ArrowDown','PageDown',' '].includes(e.key)){e.preventDefault();step(1)}if(['ArrowUp','PageUp'].includes(e.key)){e.preventDefault();step(-1)}if(e.key==='Home')show(0);if(e.key==='End')show(scenes.length-1)});
  const app=document.getElementById('app');
  app.addEventListener('touchstart',e=>touchY=e.changedTouches[0].clientY,{passive:true});
  app.addEventListener('touchend',e=>{if(touchY==null)return;const dy=e.changedTouches[0].clientY-touchY;touchY=null;if(Math.abs(dy)>42)step(dy<0?1:-1)},{passive:true});
  document.querySelectorAll('[data-next]').forEach(b=>b.addEventListener('click',()=>step(1)));

  function msg(t){clearTimeout(toastTimer);toast.textContent=t;toast.classList.add('show');toastTimer=setTimeout(()=>toast.classList.remove('show'),2200)}
  musicBtn.addEventListener('click',async()=>{
    if(!bgm.currentSrc){msg('将音乐文件放到 assets/music.mp3 即可启用背景音乐');return}
    try{
      if(bgm.paused){await bgm.play();musicBtn.classList.add('playing');musicBtn.setAttribute('aria-pressed','true')}
      else{bgm.pause();musicBtn.classList.remove('playing');musicBtn.setAttribute('aria-pressed','false')}
    }catch{msg('请先添加 assets/music.mp3，再点击音乐按钮播放')}
  });
  bgm.addEventListener('error',()=>musicBtn.title='添加 assets/music.mp3 后启用背景音乐');

  document.querySelectorAll('.petal-field').forEach(field=>{
    for(let i=0;i<13;i++){
      const p=document.createElement('i');p.className='petal';
      p.style.setProperty('--x',(4+Math.random()*92)+'%');p.style.setProperty('--dx',(-65+Math.random()*130)+'px');
      p.style.setProperty('--dur',(7+Math.random()*7)+'s');p.style.setProperty('--delay',(-Math.random()*11)+'s');
      p.style.transform=`scale(${.55+Math.random()*.8}) rotate(${Math.random()*160}deg)`;field.appendChild(p)
    }
  });
  const fromHash=parseInt(location.hash.slice(1),10);if(fromHash>=1&&fromHash<=scenes.length){index=fromHash-1;scenes.forEach((s,n)=>{s.classList.toggle('is-active',n===index);s.classList.toggle('is-before',n<index);s.classList.toggle('is-after',n>index)});progress.style.width=((index+1)/scenes.length*100)+'%'}
})();
