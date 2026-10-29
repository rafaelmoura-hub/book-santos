const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {readFileSync}=require('node:fs');

for(const fail of [false,true])test(`login encerra carregamento após ${fail?'erro':'sucesso'}`,async()=>{
 const classes=new Set(),button={disabled:false},attributes={},message={};
 let settle,requests=0;
 const request=new Promise((resolve,reject)=>{settle=()=>fail?reject(Error('Login inválido')):resolve({funcao:'adm'});});
 const logo={classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)}};
 const location={protocol:'http:'};
 const context={location,localStorage:{removeItem(){}},BookAPI:{request(){requests++;return request;}},document:{getElementById:id=>id==='mensagem'?message:{value:'teste'},querySelector:()=>logo}};
 vm.runInNewContext(readFileSync('login.js','utf8'),context);
 const event={preventDefault(){},target:{querySelector:()=>button,setAttribute(k,v){attributes[k]=v;}}};
 const pending=context.entrar(event);
 assert.equal(classes.has('login-loading'),true);assert.equal(button.disabled,true);assert.equal(attributes['aria-busy'],'true');
 await context.entrar(event);assert.equal(requests,1);
 settle();await pending;
 assert.equal(classes.has('login-loading'),false);assert.equal(button.disabled,false);assert.equal(attributes['aria-busy'],'false');
 if(fail)assert.equal(message.textContent,'Login inválido');else assert.equal(location.href,'/adm/admin.html');
});
