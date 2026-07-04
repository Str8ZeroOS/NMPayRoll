
const router=require('express').Router();
const fs=require('fs'),path=require('path');
const DATA=process.env.STR8ZERO_DATA||'/srv/str8zero-os/data';
const SF=path.join(DATA,'tier4_state.json');
const DM='claude-opus-4-8',CAP=parseFloat(process.env.DAILY_LOSS_BUDGET||'1.00');
const MODELS={'claude-opus-4-8':{label:'Claude Opus 4.8',tier:'frontier',description:'Latest Opus — highest intelligence available',input_per_1k:0.015,output_per_1k:0.075,max_tokens:32768,recommended_for:['frontier reasoning','deep compliance analysis','most demanding tasks']},'claude-opus-4-7':{label:'Claude Opus 4.7',tier:'frontier',description:'Advanced reasoning and architecture decisions',input_per_1k:0.015,output_per_1k:0.075,max_tokens:32768,recommended_for:['architecture decisions','complex analysis']},'claude-opus-4-6':{label:'Claude Opus 4.6',tier:'frontier',description:'Multi-step analysis, highest accuracy',input_per_1k:0.015,output_per_1k:0.075,max_tokens:32768,recommended_for:['complex compliance','legal review']},'claude-sonnet-4-6':{label:'Claude Sonnet 4.6',tier:'balanced',description:'Best speed/intelligence balance',input_per_1k:0.003,output_per_1k:0.015,max_tokens:8096,recommended_for:['NM compliance Q&A','document drafting','general business']},'claude-haiku-4-5':{label:'Claude Haiku 4.5',tier:'fast',description:'Fastest — simple lookups and quick answers',input_per_1k:0.0008,output_per_1k:0.004,max_tokens:4096,recommended_for:['quick lookups','simple calculations']}};
function load(){try{if(fs.existsSync(SF)){const s=JSON.parse(fs.readFileSync(SF,'utf8'));s.session_calls=0;s.session_tokens_in=0;s.session_tokens_out=0;s.session_cost_usd=0.0;return s;}}catch{}return{enabled:false,model:DM,enabled_by:'system',enabled_at:'',disabled_at:'',disable_reason:'',session_calls:0,session_tokens_in:0,session_tokens_out:0,session_cost_usd:0.0,daily_cap_usd:CAP,total_calls:0,total_cost_usd:0.0};}
function save(s){try{fs.writeFileSync(SF,JSON.stringify(s,null,2));}catch{}}
function ui(s){const mi=MODELS[s.model]||MODELS[DM];const pct=s.daily_cap_usd>0?Math.round(s.session_cost_usd/s.daily_cap_usd*100):0;return{enabled:s.enabled,model:s.model,model_label:mi.label,model_tier:mi.tier,model_desc:mi.description,recommended_for:mi.recommended_for,cloud_notice:s.enabled?'Cloud AI is ON — questions sent to Anthropic. Anthropic does not train on API data. Disable to return to local-only mode.':'Local only — all AI runs on your Alienware. Nothing leaves your machine.',enabled_at:s.enabled_at,disabled_at:s.disabled_at,disable_reason:s.disable_reason,has_api_key:!!(process.env.ANTHROPIC_API_KEY),session:{calls:s.session_calls,tokens_in:s.session_tokens_in,tokens_out:s.session_tokens_out,cost_usd:Math.round(s.session_cost_usd*10000)/10000},budget:{daily_cap_usd:s.daily_cap_usd,used_usd:Math.round(s.session_cost_usd*10000)/10000,remaining_usd:Math.round(Math.max(0,s.daily_cap_usd-s.session_cost_usd)*10000)/10000,pct_used:pct},available_models:Object.fromEntries(Object.entries(MODELS).map(([k,v])=>[k,{label:v.label,tier:v.tier,description:v.description,recommended_for:v.recommended_for,cost_per_1k_out:v.output_per_1k}]))};}
let state=load();
router.get('/status',(_,res)=>res.json(ui(state)));
router.get('/models',(_,res)=>res.json({models:MODELS,default_model:DM,current_model:state.model}));
router.post('/enable',(req,res)=>{
  const{model=DM,by='owner'}=req.body||{};
  if(!process.env.ANTHROPIC_API_KEY)return res.status(400).json({error:'ANTHROPIC_API_KEY not set in .env — add it to /srv/str8zero-os/backend/.env'});
  if(!MODELS[model])return res.status(400).json({error:'Unknown model: '+model,valid:Object.keys(MODELS)});
  state.enabled=true;state.model=model;state.enabled_by=by;state.enabled_at=new Date().toISOString();state.disabled_at='';state.disable_reason='';
  save(state);console.log('[Tier4] ENABLED model='+model+' by='+by);res.json({success:true,...ui(state)});
});
router.post('/disable',(req,res)=>{
  const{reason='owner_request'}=req.body||{};
  state.enabled=false;state.disabled_at=new Date().toISOString();state.disable_reason=reason;
  save(state);console.log('[Tier4] DISABLED reason='+reason);res.json({success:true,...ui(state)});
});
router.post('/model',(req,res)=>{
  const{model}=req.body||{};
  if(!model||!MODELS[model])return res.status(400).json({error:'Unknown model: '+model,valid:Object.keys(MODELS)});
  state.model=model;save(state);res.json({success:true,...ui(state)});
});
router.post('/ask',async(req,res)=>{
  const{question,model}=req.body||{};
  if(!question)return res.status(400).json({error:'question required'});
  if(!state.enabled)return res.status(403).json({error:'Cloud AI is disabled. Enable from dashboard.',...ui(state)});
  if(!process.env.ANTHROPIC_API_KEY)return res.status(400).json({error:'ANTHROPIC_API_KEY not configured'});
  const um=model||state.model,mi=MODELS[um]||MODELS[DM];
  if((state.session_cost_usd+(500/1000)*mi.output_per_1k)>state.daily_cap_usd){state.enabled=false;state.disable_reason='daily_budget_exhausted';save(state);return res.status(402).json({error:'Daily budget $'+state.daily_cap_usd+' exhausted. Cloud AI auto-disabled.',...ui(state)});}
  const t0=Date.now();
  try{
    const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':process.env.ANTHROPIC_API_KEY||'','anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model:um,max_tokens:mi.max_tokens,system:'You are Str8ZeRO Cognitive Engine for NM business. Mark every claim [C:HIGH][C:MED][C:LOW][C:STALE][C:VERIFY]. Lead with conclusions. No filler.',messages:[{role:'user',content:question}]})});
    if(!r.ok)throw new Error('Anthropic HTTP '+r.status);
    const d=await r.json();const c=d.content?.[0]?.text||'';
    const tin=d.usage?.input_tokens||0,tout=d.usage?.output_tokens||0;
    const cost=(tin/1000)*mi.input_per_1k+(tout/1000)*mi.output_per_1k;
    state.session_calls++;state.session_tokens_in+=tin;state.session_tokens_out+=tout;state.session_cost_usd+=cost;state.total_calls++;state.total_cost_usd+=cost;save(state);
    res.json({answer:c,model:um,model_label:mi.label,tokens_in:tin,tokens_out:tout,cost_usd:Math.round(cost*1000000)/1000000,latency_ms:Date.now()-t0,tier:'tier4_cloud',cloud:true,cloud_notice:mi.label+' — $'+Math.round(cost*10000)/10000+' | Session: $'+Math.round(state.session_cost_usd*10000)/10000,session:{calls:state.session_calls,cost_usd:Math.round(state.session_cost_usd*10000)/10000}});
  }catch(e){res.status(500).json({error:String(e),cloud:true});}
});
module.exports={cloudAIRoutes:router};
