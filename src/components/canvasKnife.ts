import type {ControlMesh} from '../types';
import type {KnifePoint,KnifeStep} from './knifeTopology';
type V=[number,number,number];
export type KnifeHit={face:number;point:KnifePoint};
export function knifePointPosition(mesh:ControlMesh,p:KnifePoint):V{
 if('vertex' in p)return mesh.vertices[p.vertex];
 const [a,b]=p.edge;return mesh.vertices[a].map((v,i)=>v*(1-p.fraction)+mesh.vertices[b][i]*p.fraction) as V;
}
export function pointOnFace(mesh:ControlMesh,face:number,p:KnifePoint):boolean{
 const f=mesh.faces[face]??[];
 return 'vertex' in p?f.includes(p.vertex):f.some((a,i)=>a===p.edge[0]&&f[(i+1)%f.length]===p.edge[1]||a===p.edge[1]&&f[(i+1)%f.length]===p.edge[0]);
}
export function knifeChord(mesh:ControlMesh,start:KnifePoint|null,hit:KnifeHit|null):KnifeStep|null{
 if(!start||!hit||!pointOnFace(mesh,hit.face,start))return null;
 const a=knifePointPosition(mesh,start),b=knifePointPosition(mesh,hit.point);
 if(a.every((v,i)=>Math.abs(v-b[i])<1e-8))return null;
 return {face:hit.face,from:start,to:hit.point};
}
export function knifeLines(mesh:ControlMesh,steps:KnifeStep[]):V[]{return steps.flatMap(s=>[knifePointPosition(mesh,s.from),knifePointPosition(mesh,s.to)])}
