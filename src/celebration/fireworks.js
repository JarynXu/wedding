/** 主题烟花以细光尾展开祝福字；光晕复用位图，连续赠礼不重复创建滤镜。 */
export class ThemeFireworks {
  constructor(theme) {
    this.theme=theme;
    this.colors=theme==='chinese'?['#ffd991','#fff6db','#eab264']:['#f5cabc','#fff8e9','#e7c78e'];
    this.glows=this.colors.map(color=>{
      const canvas=document.createElement('canvas');canvas.width=canvas.height=40;const c=canvas.getContext('2d');
      const gradient=c.createRadialGradient(20,20,0,20,20,20);gradient.addColorStop(0,color);gradient.addColorStop(.14,color+'dd');gradient.addColorStop(.45,color+'45');gradient.addColorStop(1,color+'00');
      c.fillStyle=gradient;c.fillRect(0,0,40,40);return canvas;
    });
  }
  draw(c,{sparks,variant},t,{width,height,left}) {
    const available=width-left, radius=Math.min(76,available*.42),x=left+available*.5,y=height*(.25+variant*.065);
    const launch=Math.min(1,t/.55),start=height-100;
    if(t<.55){
      const py=start+(y-start)*(1-(1-launch)**2),trail=c.createLinearGradient(x,py,x,py+45);
      trail.addColorStop(0,'#fff7db');trail.addColorStop(1,'#e8ba7600');c.strokeStyle=trail;c.lineWidth=1.2;
      c.beginPath();c.moveTo(x,py+45);c.lineTo(x,py);c.stroke();c.drawImage(this.glows[1],x-9,py-9,18,18);
    }
    const age=t-.55;if(age<0)return;
    const fade=Math.min(1,age/.12)*Math.max(0,1-(age/2.85)**1.8);
    for(let i=0;i<sparks.length;i++){
      const p=sparks[i],reach=radius*(.68+(i%4)*.1)*(1-Math.exp(-age*2.1)),gravity=age*age*8;
      const angle=i/sparks.length*Math.PI*2+p.angle*.025;
      const px=x+Math.cos(angle)*reach,py=y+Math.sin(angle)*reach+gravity;
      c.globalAlpha=fade*(.65+.35*Math.sin(age*9+i)**2);
      c.strokeStyle=this.colors[i%3];c.lineWidth=.65;
      c.beginPath();c.moveTo(x+Math.cos(angle)*reach*.76,y+Math.sin(angle)*reach*.76+gravity*.85);c.quadraticCurveTo(x+Math.cos(angle)*reach*.9,py-2,px,py);c.stroke();
      c.drawImage(this.glows[i%3],px-5,py-5,10,10);
      c.fillStyle='#fff9e9';c.beginPath();c.arc(px,py,.7,0,Math.PI*2);c.fill();
    }
    const lettering=Math.min(1,Math.max(0,(age-.15)/.4))*Math.min(1,Math.max(0,(2.75-age)/.65));
    if(lettering){
      c.save();c.translate(x,y+8);c.scale(.92+.08*Math.min(1,age),.92+.08*Math.min(1,age));
      c.globalAlpha=lettering;c.textAlign='center';c.textBaseline='middle';c.font=this.theme==='chinese'?'38px "Noto Serif SC",serif':'italic 44px "Great Vibes",cursive';
      const word=this.theme==='chinese'?'囍':'Love';
      c.strokeStyle=this.theme==='chinese'?'#9a451cc4':'#855447ae';c.lineWidth=1.8;c.strokeText(word,0,0,available-22);
      c.shadowColor=this.colors[0];c.shadowBlur=12;c.fillStyle='#fff5d9';c.fillText(word,0,0,available-22);c.shadowBlur=0;c.restore();
    }
    c.globalAlpha=1;
  }
}
