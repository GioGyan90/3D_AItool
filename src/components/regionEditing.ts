import type {ControlMesh} from '../types';
export function assertRegionProtected(before:ControlMesh,after:ControlMesh,locked:number[]){
 if(!locked.length)return;
 // Connectivity edits are conservatively disabled while a region is locked.
 if(before.vertices.length!==after.vertices.length||JSON.stringify(before.faces)!==JSON.stringify(after.faces))throw Error('区域锁定期间不能修改拓扑，请先解锁');
 for(const i of locked){if(!before.vertices[i]||!after.vertices[i]||before.vertices[i].some((x,j)=>x!==after.vertices[i][j]))throw Error('操作会移动锁定顶点 #'+i);}
}
export function slideOnEdge(mesh:ControlMesh,vertex:number,toward:number,fraction:number){
 if(!Number.isFinite(fraction)||fraction<0||fraction>=1)throw Error('滑动比例必须在0到1之间，不含1');
 const a=mesh.vertices[vertex],b=mesh.vertices[toward];
 if(!a||!b||vertex===toward||!mesh.faces.some(f=>f.some((id,i)=>id===vertex&&(f[(i+1)%f.length]===toward||f[(i+f.length-1)%f.length]===toward))))throw Error('请选择相邻的共享边顶点');
 const vertices=mesh.vertices.map(v=>[...v] as typeof v);
 vertices[vertex]=a.map((x,i)=>x+(b[i]-x)*fraction) as typeof a;
 const normal=(vs:ControlMesh['vertices'],f:number[])=>{const n=[0,0,0];for(let i=0;i<f.length;i++){const a=vs[f[i]],b=vs[f[(i+1)%f.length]];n[0]+=(a[1]-b[1])*(a[2]+b[2]);n[1]+=(a[2]-b[2])*(a[0]+b[0]);n[2]+=(a[0]-b[0])*(a[1]+b[1]);}return n;};
 for(const [i,f] of mesh.faces.entries()){if(!f.includes(vertex))continue;const n=normal(mesh.vertices,f),q=normal(vertices,f);if(Math.hypot(...q)<1e-9||n.reduce((s,x,j)=>s+x*q[j],0)<=0)throw Error('滑动导致面退化或反转 #'+i);}
 return {...mesh,vertices};
}
