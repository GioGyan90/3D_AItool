import * as T from 'three';

// Preserve source geometry and finger identity. Tight source crease weights
// fold under a running grip, so broaden their interphalangeal transitions.
export function calibrateRunnerHands(geometry,joints){
  const si=geometry.attributes.skinIndex,sw=geometry.attributes.skinWeight,p=geometry.attributes.position,width=.022;
  const report={transitionHalfWidth:width,thumbRadialFade:[.018,.035],vertices:0,geometryChanged:false};
  for(const side of ['Left','Right']){
    const suffix=side==='Left'?'l':'r',hand=joints.findIndex(j=>j.name==='mixamorig'+side+'Hand');
    const chains=['Index','Middle','Ring','Pinky','Thumb'].map(f=>{
      const ids=[1,2,3].map(k=>joints.findIndex(j=>j.name==='mixamorig'+side+'Hand'+f+k)),points=ids.map(id=>joints[id].position),leaf=joints.findIndex(j=>j.name==='Runner_'+f.toLowerCase()+'_04_leaf_'+suffix),end=leaf>=0?joints[leaf].position:points[2],axis=end.clone().sub(points[0]).normalize();
      return {f,ids,leaf,origin:points[0],axis,centers:points.map(v=>v.clone().sub(points[0]).dot(axis))};
    });
    for(let i=0;i<p.count;i++){
      const v=new T.Vector3().fromBufferAttribute(p,i),totals=new Map(),keep=new Map();let affected=false;
      for(let k=0;k<4;k++){
        const id=si.getComponent(i,k),w=sw.getComponent(i,k);if(w<1e-8)continue;
        const chain=chains.find(c=>c.ids.includes(id)||c.leaf===id);
        if(chain&&chain.f!=='Thumb'){totals.set(chain,(totals.get(chain)||0)+w);affected=true;}
        else if(chain){
          const relative=v.clone().sub(chain.origin),radial=relative.clone().addScaledVector(chain.axis,-relative.dot(chain.axis)).length(),gate=1-T.MathUtils.smoothstep(radial,...report.thumbRadialFade);
          keep.set(id,(keep.get(id)||0)+w*gate);keep.set(hand,(keep.get(hand)||0)+w*(1-gate));if(gate<1-1e-7)affected=true;
        }else keep.set(id,(keep.get(id)||0)+w);
      }
      if(!affected)continue;
      for(const [chain,total]of totals){
        const along=v.clone().sub(chain.origin).dot(chain.axis),s1=T.MathUtils.smoothstep(along,chain.centers[1]-width,chain.centers[1]+width),s2=T.MathUtils.smoothstep(along,chain.centers[2]-width,chain.centers[2]+width);
        chain.ids.forEach((id,k)=>keep.set(id,(keep.get(id)||0)+[1-s1,s1-s2,s2][k]*total));
      }
      const out=[...keep].filter(([,w])=>w>1e-8).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=out.reduce((s,[,w])=>s+w,0);
      for(let k=0;k<4;k++){si.setComponent(i,k,out[k]?.[0]||0);sw.setComponent(i,k,(out[k]?.[1]||0)/sum);}report.vertices++;
    }
  }
  return report;
}
