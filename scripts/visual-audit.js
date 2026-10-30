/* Runs inside Chrome through CDP; no operational records or personal data are sent out. */
function auditVisualState(){
 const rgb=value=>(value.match(/[\d.]+/g)||[]).map(Number);
 const blend=(top,bottom)=>{const a=top[3]??1;return top.slice(0,3).map((v,i)=>v*a+bottom[i]*(1-a));};
 const luminance=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const ratio=(a,b)=>{const values=[luminance(a),luminance(b)].sort((x,y)=>x-y);return (values[1]+.05)/(values[0]+.05);};
 const background=element=>{const chain=[];for(let node=element;node;node=node.parentElement)chain.unshift(node);let color=[255,255,255];for(const node of chain){const next=rgb(getComputedStyle(node).backgroundColor);if(next.length>=3)color=blend(next,color);}return color;};
 const visible=e=>e.getClientRects().length&&!e.closest('[hidden],svg,dialog:not([open])')&&getComputedStyle(e).visibility!=='hidden';
 const contrast=[],clipped=[],images=[];let checked=0;
 for(const e of document.body.querySelectorAll('*')){
  if(!visible(e)||e.disabled)continue;
  const style=getComputedStyle(e),text=[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ').trim();
  const control=e.matches('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]),select,textarea');
  const label=control?(e.value||e.placeholder||e.getAttribute('aria-label')):text;
  if(label){
   const color=rgb(control&&!e.value&&e.placeholder?getComputedStyle(e,'::placeholder').color:style.color),bg=background(e);
   if(color.length>=3){
    checked++;let alpha=color[3]??1;for(let node=e;node;node=node.parentElement)alpha*=Number(getComputedStyle(node).opacity);
    const foreground=blend([...color.slice(0,3),alpha],bg),actual=ratio(foreground,bg),required=parseFloat(style.fontSize)>=24||parseFloat(style.fontSize)>=18.66&&Number(style.fontWeight)>=700?3:4.5;
    if(actual+.02<required)contrast.push({element:e.id||e.className||e.tagName,text:String(label).slice(0,65),ratio:+actual.toFixed(2),color:style.color,background:bg.map(Math.round)});
   }
  }
  if(e.tagName==='IMG'&&e.complete&&(!e.naturalWidth||!e.naturalHeight))images.push(e.getAttribute('src'));
  if(!label||control||e.matches('.theme-label,.skip-link,option,script,style'))continue;
  if(['hidden','clip'].includes(style.overflowX)&&e.clientWidth>0&&e.scrollWidth>e.clientWidth+2&&!e.matches('main,body,html'))clipped.push({element:e.id||e.className||e.tagName,text:String(label).slice(0,65),width:e.clientWidth,content:e.scrollWidth});
 }
 return {theme:document.documentElement.dataset.theme,width:innerWidth,checked,contrast,clipped,images};
}
module.exports={auditVisualState};
