
const router=require('express').Router();
const http=require('http');
const crypto=require('crypto');
const OLLAMA=process.env.OLLAMA_BASE_URL||'http://localhost:11434';
const DEFAULT=process.env.OLLAMA_DEFAULT_MODEL||'str8zero-llama3.1';
const TO=parseInt(process.env.OLLAMA_TIMEOUT||'60')*1000;
const MARKERS=['[C:HIGH]','[C:MED]','[C:LOW]','[C:STALE]','[C:VERIFY]'];
const sessions={};
const SYS='You are Str8ZeRO Cognitive Engine for STR8ZERO OS NM business. MANDATORY: Mark every factual claim [C:HIGH][C:MED][C:LOW][C:STALE][C:VERIFY] inline. Use TECHNICAL/ANALYTICAL/DIAGNOSTIC/STRATEGIC schemas. Lead with conclusions. Local Tier 3 — nothing leaves this machine.';
function cal(t){const s=t.replace(/\n+/g,' ').split(/(?<=[.!?])\s+/).filter(x=>x.trim().length>25&&!/^[A-Z\s:]+$/.test(x.trim()));if(!s.length)return{compliance_pct:100,passed:true};const m=s.filter(x=>MARKERS.some(k=>x.includes(k))).length;const p=Math.round(m/s.length*100);return{compliance_pct:p,marked:m,total:s.length,passed:p>=55};}
async function ollamaOk(){return new Promise(r=>{const u=new URL(OLLAMA+'/api/tags');const q=http.get({hostname:u.hostname,port:u.port||80,path:u.pathname,timeout:2000},x=>r(x.statusCode===200));q.on('error',()=>r(false));q.on('timeout',()=>{q.destroy();r(false);});});}
async function ollamaModels(){return new Promise(r=>{const u=new URL(OLLAMA+'/api/tags');let d='';const q=http.get({hostname:u.hostname,port:u.port||80,path:u.pathname,timeout:3000},x=>{x.on('data',c=>d+=c);x.on('end',()=>{try{r(JSON.parse(d).models?.map(m=>m.name)||[]);}catch{r([]);}});});q.on('error',()=>r([]));q.on('timeout',()=>{q.destroy();r([]);});});}
router.get('/status',async(_,res)=>{
  const online=await ollamaOk();const ms=online?await ollamaModels():[];
  res.json({online,ollama_url:OLLAMA,default_model:DEFAULT,models:ms,str8zero_loaded:ms.some(m=>m.includes('str8zero')),llama31_loaded:ms.some(m=>m.includes('llama3.1')),tier:'tier3_local',cost:'$0.00',privacy:'All processing local. Nothing sent externally.',hardware:'Alienware p130f RTX 4070 i9 32GB',recommended_model:ms.find(m=>m.includes('str8zero'))||ms.find(m=>m.includes('llama3.1'))||null});
});
router.get('/models',async(_,res)=>{res.json({models:await ollamaModels(),default:DEFAULT,ollama_url:OLLAMA});});
router.post('/chat',async(req,res)=>{
  const{message,messages:raw,model:m,conversation_id}=req.body||{};
  if(!message&&!raw?.length)return res.status(400).json({error:'message or messages required'});
  const model=m||DEFAULT,cid=conversation_id||crypto.randomUUID();
  if(!sessions[cid])sessions[cid]=[];const h=sessions[cid];
  if(message)h.push({role:'user',content:message});else if(raw){sessions[cid]=[...raw];h.length=0;raw.forEach(x=>h.push(x));}
  const body=JSON.stringify({model,system:SYS,messages:h,stream:true,options:{temperature:0.25,top_p:0.88,top_k:35,repeat_penalty:1.18,num_ctx:16384,num_predict:8192}});
  res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache');res.setHeader('Connection','keep-alive');res.setHeader('X-Accel-Buffering','no');
  const t0=Date.now();let full='';
  try{
    const u=new URL(OLLAMA+'/api/chat');
    const oq=http.request({hostname:u.hostname,port:u.port||80,path:u.pathname,method:'POST',timeout:TO,headers:{'Content-Type':'application/json'}},(or)=>{
      let buf='';
      or.on('data',(c)=>{buf+=c.toString();const ls=buf.split('\n');buf=ls.pop()||'';
        for(const l of ls){if(!l.trim())continue;try{const p=JSON.parse(l);const t=p?.message?.content||'';
          if(t){full+=t;res.write('data: '+JSON.stringify({type:'token',content:t,done:false})+'\n\n');}
          if(p?.done){h.push({role:'assistant',content:full});if(h.length>40)h.splice(0,h.length-40);
            res.write('data: '+JSON.stringify({type:'done',done:true,content:full,conversation_id:cid,model,latency_ms:Date.now()-t0,tokens_eval:p.eval_count||0,tokens_prompt:p.prompt_eval_count||0,calibration:cal(full),tier:'tier3_local',cost:'$0.00'})+'\n\n');
            res.end();}}catch{}}});
      or.on('end',()=>{if(!res.writableEnded)res.end();});
      or.on('error',(e)=>{res.write('data: '+JSON.stringify({type:'error',error:e.message})+'\n\n');res.end();});
    });
    oq.on('error',(e)=>{res.write('data: '+JSON.stringify({type:'error',error:'Ollama unreachable: '+e.message+'. Run: ollama serve on Alienware'})+'\n\n');res.end();});
    oq.on('timeout',()=>{oq.destroy();res.write('data: '+JSON.stringify({type:'error',error:'Ollama timeout — model may still be loading'})+'\n\n');res.end();});
    req.on('close',()=>{if(!oq.destroyed)oq.destroy();});
    oq.write(body);oq.end();
  }catch(e){res.write('data: '+JSON.stringify({type:'error',error:e.message})+'\n\n');res.end();}
});
router.post('/ask',async(req,res)=>{
  const{question,model:m,conversation_id}=req.body||{};
  if(!question)return res.status(400).json({error:'question required'});
  const model=m||DEFAULT,cid=conversation_id||'default';
  if(!sessions[cid])sessions[cid]=[];
  sessions[cid].push({role:'user',content:question});
  const t0=Date.now();
  try{
    const r=await fetch(OLLAMA+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(TO),body:JSON.stringify({model,system:SYS,messages:sessions[cid],stream:false,options:{temperature:0.25,top_p:0.88,top_k:35,repeat_penalty:1.18,num_ctx:16384,num_predict:8192}})});
    if(!r.ok)throw new Error('Ollama HTTP '+r.status);
    const d=await r.json();const c=d?.message?.content||'';
    sessions[cid].push({role:'assistant',content:c});if(sessions[cid].length>40)sessions[cid].splice(0,sessions[cid].length-40);
    res.json({answer:c,model,conversation_id:cid,latency_ms:Date.now()-t0,tokens_eval:d?.eval_count||0,calibration:cal(c),tier:'tier3_local',cost:'$0.00'});
  }catch(e){res.status(503).json({error:'Ollama error: '+e.message,hint:'Make sure ollama serve is running on your Alienware'});}
});
router.delete('/history',(req,res)=>{
  const{conversation_id}=req.body||{};
  if(conversation_id&&sessions[conversation_id]){delete sessions[conversation_id];res.json({cleared:conversation_id});}
  else{const n=Object.keys(sessions).length;Object.keys(sessions).forEach(k=>delete sessions[k]);res.json({cleared:'all',count:n});}
});
module.exports={localAIRoutes:router};
