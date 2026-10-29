const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');
function screen({saved=null,dark=false,blocked=false}={}){
 const storage=new Map(saved?[['book:theme',saved]]:[]),created=[],handlers={};
 const element=()=>({attributes:{},classList:{add(){}},append(){},prepend(){},setAttribute(k,v){this.attributes[k]=v;}});
 const root={dataset:{}},media={matches:dark,addEventListener(type,cb){handlers.media=cb;}};
 const context={Event,localStorage:{getItem(k){if(blocked)throw Error('blocked');return storage.get(k)||null;},setItem(k,v){if(blocked)throw Error('blocked');storage.set(k,v);}},document:{documentElement:root,readyState:'complete',createElement(){const e=element();created.push(e);return e;},getElementById(id){return created.find(e=>e.id===id);},querySelector(){return null;},body:element()},window:{matchMedia:()=>media,dispatchEvent(){},addEventListener(type,cb){handlers[type]=cb;}}};
 vm.runInNewContext(readFileSync('assets/theme.js','utf8'),context);return {root,storage,media,handlers,button:created.find(e=>e.id==='themeToggle')};
}
test('tema usa preferência válida, segue sistema sem preferência e atualiza entre abas',()=>{
 const s=screen({dark:true});assert.equal(s.root.dataset.theme,'dark');s.media.matches=false;s.handlers.media();assert.equal(s.root.dataset.theme,'light');
 s.button.onclick();assert.equal(s.storage.get('book:theme'),'dark');assert.equal(s.button.attributes['aria-pressed'],'true');
 s.media.matches=false;s.handlers.media();assert.equal(s.root.dataset.theme,'dark');
 s.handlers.storage({key:'book:theme',newValue:'light'});assert.equal(s.root.dataset.theme,'light');
 assert.equal(screen({saved:'light',dark:true}).root.dataset.theme,'light');assert.equal(screen({saved:'inválido',dark:true}).root.dataset.theme,'dark');
});
test('storage bloqueado não impede trocar o tema nem exige dados pessoais',()=>{
 const s=screen({blocked:true});assert.equal(s.root.dataset.theme,'light');s.button.onclick();assert.equal(s.root.dataset.theme,'dark');assert.equal(s.storage.size,0);s.button.onclick();assert.equal(s.root.dataset.theme,'light');
});
