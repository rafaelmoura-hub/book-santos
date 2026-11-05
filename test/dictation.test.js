const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function fixture({supported=true,consent=true}={}){
 const fields=[],recognitions=[],listeners={},notices=[],timers=new Map();let submits=0;
 const field={id:'flowCommentBody',name:'',autocomplete:'',value:'Texto anterior',selectionStart:14,selectionEnd:14,maxLength:100,disabled:false,readOnly:false,isConnected:true,button:null,
  matches:()=>false,closest:()=>null,getClientRects:()=>[{}],after(button){this.button=button;},addEventListener(type,fn){this[type]=fn;},dispatchEvent(){},
  setRangeText(text,from,to){this.value=this.value.slice(0,from)+text+this.value.slice(to);this.selectionStart=this.selectionEnd=from+text.length;}};
 fields.push(field);
 function element(){return {setAttribute(k,v){this[k]=v;},textContent:'',className:'',innerHTML:''};}
 class Recognition{constructor(){recognitions.push(this);}start(){this.started=true;}stop(){this.stopped=true;this.onend?.();}abort(){this.aborted=true;this.onend?.();}}
 const window={isSecureContext:true,confirm:()=>consent,addEventListener:(k,v)=>listeners[k]=v,...(supported?{SpeechRecognition:Recognition}:{})};
 const document={readyState:'complete',hidden:false,querySelectorAll:()=>fields,createElement:element,body:{append:node=>notices.push(node)},addEventListener:(k,v)=>listeners[k]=v};
 vm.runInNewContext(fs.readFileSync('assets/dictation.js','utf8'),{window,document,MutationObserver:class{observe(){}},Event:class{},setTimeout:fn=>{timers.set(timers.size+1,fn);return timers.size;},clearTimeout:id=>timers.delete(id)});
 const result=(text,index=0,final=true)=>{const results=[];results[index]=Object.assign([{transcript:text}],{isFinal:final});recognitions.at(-1).onresult({resultIndex:index,results});};
 return {field,window,document,listeners,recognitions,notices,result,timers,get submits(){return submits;}};
}
test('ditado preserva texto, ignora parciais e duplicatas, respeita cursor e nao envia mensagens',()=>{
 const f=fixture();f.field.button.onclick();assert.equal(f.recognitions[0].lang,'pt-BR');
 f.result('teste parcial',0,false);assert.equal(f.field.value,'Texto anterior');
 f.result('nova frase');assert.equal(f.field.value,'Texto anterior nova frase');f.result('nova frase');assert.equal(f.field.value,'Texto anterior nova frase');
 f.field.selectionStart=0;f.field.selectionEnd=5;f.result('Outro',1);assert.equal(f.field.value,'Outro anterior nova frase');assert.equal(f.submits,0);
 f.field.button.onclick();assert.equal(f.field.button['aria-pressed'],'false');assert.equal(f.timers.size,0);
});
test('ditado trata recusa, navegador sem suporte, erro, limite e fechamento sem apagar texto',()=>{
 const denied=fixture({consent:false});denied.field.button.onclick();assert.equal(denied.recognitions.length,0);
 const unsupported=fixture({supported:false});unsupported.field.button.onclick();assert.match(unsupported.notices[0].textContent,/indisponível/);
 const f=fixture();f.field.button.onclick();f.recognitions[0].onerror({error:'not-allowed'});assert.match(f.notices[0].textContent,/não autorizado/);assert.equal(f.field.value,'Texto anterior');
 f.field.maxLength=15;f.field.button.onclick();f.result('muito longo');assert.equal(f.field.value,'Texto anterior');assert.equal(f.field.button['aria-pressed'],'false');
 f.field.button.onclick();f.document.hidden=true;f.listeners.visibilitychange();assert.equal(f.field.button['aria-pressed'],'false');
 f.document.hidden=false;f.field.button.onclick();f.listeners.submit();assert.equal(f.field.button['aria-pressed'],'false');
});
test('parar aguarda as ultimas palavras e a previa nunca substitui o texto confirmado',()=>{
 const f=fixture();f.field.button.onclick();const recognition=f.recognitions[0];
 assert.equal(recognition.interimResults,true);assert.equal(f.field.button['aria-label'],'Parar ditado');
 f.result('fala ainda em processamento',0,false);assert.equal(f.field.value,'Texto anterior');assert.match(f.notices[0].textContent,/Ouvindo:/);
 recognition.stop=()=>{};f.field.button.onclick();
 f.result('últimas palavras');assert.equal(f.field.value,'Texto anterior últimas palavras');
 recognition.onend();assert.equal(f.field.button['aria-pressed'],'false');assert.equal(f.field.button['aria-label'],'Ditar texto neste campo');
});
