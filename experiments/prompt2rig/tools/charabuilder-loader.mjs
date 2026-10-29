import path from 'node:path';
import {pathToFileURL} from 'node:url';
export async function resolve(s,c,next){
  if(s==='three')return {url:pathToFileURL(path.resolve(process.env.CHARABUILDER_SOURCE,'dist/vendor/three.module.js')).href,shortCircuit:true};
  return next(s,c);
}
