import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

test('local server: lab routes, local assets, keyless failure, private-file boundary',async()=>{
  const child=spawn(process.execPath,['server.mjs'],{cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,FAL_KEY:'your_fal_key_here',PORT:'0',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
  try {
    const base=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('server startup timed out')),5000);
      child.stdout.on('data',data=>{const m=String(data).match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',code=>{clearTimeout(timer);reject(new Error('server exited '+code));});
    });
    const home=await fetch(base,{redirect:'manual'});assert.equal(home.status,302);assert.equal(home.headers.get('location'),'/lab/');
    const page=await fetch(base+'/lab/');assert.equal(page.status,200);assert.match(await page.text(),/Motion Lab/);
    assert.equal((await fetch(base+'/vendor/three.module.js')).status,200);
    assert.equal((await (await fetch(base+'/api/status')).json()).falConfigured,false);
    const generation=await fetch(base+'/api/video',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:'waves hello'})});
    assert.equal(generation.status,503);assert.match((await generation.json()).error,/FAL_KEY/);
    assert.equal((await fetch(base+'/%2e%2e%2fserver.mjs')).status,404);
    assert.equal((await fetch(base+'/.env')).status,404);
  } finally {child.kill();}
});
