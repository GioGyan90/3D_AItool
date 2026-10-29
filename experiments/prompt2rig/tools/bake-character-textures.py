"""Bake the existing CharaBuilder face tint shaders into portable GLB textures."""
import json,sys
from pathlib import Path
from PIL import Image
import numpy as np
for row in json.loads(Path(sys.argv[1]).read_text()):
    p=np.asarray(Image.open(row['source']).convert('RGBA'),dtype=np.float64)/255
    rgb=np.where(p[:,:,:3]<=.04045,p[:,:,:3]/12.92,((p[:,:,:3]+.055)/1.055)**2.4)
    color=np.array(row['color'])
    if row['kind']=='face':
        ref=np.array([243,209,183])/255 # original male skin shader reference #f3d1b7
        ref=np.where(ref<=.04045,ref/12.92,((ref+.055)/1.055)**2.4)
        detail=np.minimum(1,rgb/np.maximum(ref,.001))
        rgb=color*(.35+.65*detail)
    elif row['kind']=='iris':
        tone=np.clip((np.sqrt(rgb@np.array([.299,.587,.114]))-.1)*2.5,0,1)
        rgb=color*tone[:,:,None]
    else:rgb=rgb*color
    srgb=np.where(rgb<=.0031308,rgb*12.92,1.055*np.maximum(rgb,0)**(1/2.4)-.055)
    result=np.dstack([np.clip(srgb,0,1),p[:,:,3]])
    Image.fromarray(np.rint(result*255).astype('uint8'),'RGBA').save(row['output'],optimize=True)
