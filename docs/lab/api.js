import { PLAN_SCHEMA, PLAN_INSTRUCTIONS, validatePlan } from './motion-plan.js?v=808b43d68f0e';
export const API_DEFAULTS={provider:'openai',baseUrl:'https://api.openai.com/v1',model:'gpt-4.1-mini',protocol:'responses'};

export function resolveConfig(config={}){
  const provider=config.provider||'openai';let base=(config.baseUrl||API_DEFAULTS.baseUrl).trim().replace(/\/+$/,'');
  const url=new URL(base);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('API 地址应为不含账号、查询参数或片段的 HTTP(S) URL');
  if(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('远程 API 请使用 HTTPS');
  if(provider==='openai'&&url.origin!=='https://api.openai.com')throw new Error('要使用第三方地址，请选择自定义 API');
  base=base.replace(/\/(responses|chat\/completions)$/,'');
  return {provider,baseUrl:base,model:(config.model||API_DEFAULTS.model).trim(),protocol:config.protocol||(provider==='openai'?'responses':'chat'),key:(config.key||'').trim()};
}

export function createRequest(config,prompt,duration){
  const c=resolveConfig(config);if(!c.key)throw new Error('请在 API 设置中填写自己的 API Key；网页不能借用此聊天的凭据');
  if(!prompt.trim()||prompt.length>3000)throw new Error('请输入 1–3000 字的动作描述');
  const input=JSON.stringify({request:prompt.trim(),preferred_duration:duration,output_schema:PLAN_SCHEMA});
  if(c.protocol==='responses')return {url:c.baseUrl+'/responses',key:c.key,body:{model:c.model,store:false,instructions:PLAN_INSTRUCTIONS,input,max_output_tokens:6500,text:{format:{type:'json_schema',name:'humanoid_motion_plan',strict:true,schema:PLAN_SCHEMA}}}};
  return {url:c.baseUrl+'/chat/completions',key:c.key,body:{model:c.model,messages:[{role:'system',content:PLAN_INSTRUCTIONS},{role:'user',content:input}],max_tokens:6500,response_format:{type:'json_object'}}};
}

export function parseResponse(data){
  if(data.error)throw new Error('API 返回错误，请检查模型、余额与请求配置');
  if(data.status==='incomplete'||data.choices?.[0]?.finish_reason==='length')throw new Error('API 输出被截断，请换用更短的动作描述');
  let content=data.output_text||data.choices?.[0]?.message?.content;
  if(!content&&Array.isArray(data.output)){
    const parts=data.output.flatMap(o=>o.content||[]);if(parts.some(p=>p.type==='refusal'))throw new Error('API 拒绝生成此动作方案');content=parts.filter(p=>p.type==='output_text').map(p=>p.text).join('');
  }
  if(!content)throw new Error('API 没有返回动作 JSON，请检查接口协议');
  if(Array.isArray(content))content=content.map(x=>x.text||'').join('');
  return validatePlan(content);
}

export async function generatePlan(config,prompt,duration,{signal,fetcher=fetch}={}){
  const request=createRequest(config,prompt,duration);
  let response;try{response=await fetcher(request.url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+request.key},body:JSON.stringify(request.body),signal});}
  catch(error){if(error.name==='AbortError'||error.name==='TimeoutError')throw error;throw new Error('无法连接 API。请检查网络、地址，以及该服务是否允许浏览器跨域（CORS）。');}
  if(!response.ok){const labels={401:'API Key 无效或已过期',403:'API 没有访问权限',404:'模型或 API 路径不存在',429:'额度不足或请求过于频繁'};throw new Error(labels[response.status]||`API 请求失败（HTTP ${response.status}），请检查接口配置`);}
  return parseResponse(await response.json());
}
