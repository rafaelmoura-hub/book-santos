const {hotels}=require('../assets/catalog');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const validHotel=name=>typeof name==='string'&&name.length>=2&&name.length<=100&&/^[\p{L}\p{N}][\p{L}\p{N} ._()-]*$/u.test(name)&&!['__proto__','prototype','constructor','Unique'].includes(name);
function validateCatalog(input){
 if(!input||!['condominium','apartments'].includes(input.kind)||typeof input.hotel!=='string'||!Array.isArray(input.apartments)||input.apartments.length>100)throw fail(400,'Informe o condomínio e até 100 apartamentos por cadastro.');
 const hotel=input.hotel.trim().normalize('NFC').replace(/\s+/g,' '),apartments=input.apartments.map(a=>typeof a==='string'?a.trim().toUpperCase():'');
 if(!validHotel(hotel)||apartments.some(a=>! /^[A-Z0-9][A-Z0-9-]{0,15}$/.test(a))||new Set(apartments).size!==apartments.length||input.kind==='apartments'&&!apartments.length)throw fail(400,'Nome inválido ou apartamentos repetidos. Use números, letras e hífen nos apartamentos.');
 return {kind:input.kind,hotel,apartments};
}
async function visibleHotels(provider,token,user){
 const rows=provider.condominiums?await provider.condominiums(token):hotels.map(name=>({name}));
 const names=rows.map(r=>r.name).filter(name=>name!=='Unique');
 if(user?.mestre)return names;
 const access=(await provider.access(token)).map(r=>r.hotel==='Unique'?'Unique Residence':r.hotel);
 return names.filter(name=>access.includes(name));
}
module.exports={validateCatalog,visibleHotels,validHotel};
