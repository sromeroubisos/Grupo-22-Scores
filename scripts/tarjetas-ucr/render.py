import fitz, sys, os
from PIL import Image
D = os.environ.get('TARJETAS_DIR', 'tarjetas/').rstrip('/') + '/'
def render(name, dpi=95):
    d=fitz.open(D+name+'.pdf')
    ims=[]
    for pi,(a,b) in enumerate(((0.595,1.0),(0.0,0.42))):
        pm=d[pi].get_pixmap(dpi=dpi)
        im=Image.frombytes('RGB',(pm.w,pm.h),pm.samples)
        ims.append(im.crop((0,int(pm.h*a),pm.w,int(pm.h*b))))
    w=ims[0].width; h=sum(i.height for i in ims)
    out=Image.new('RGB',(w,h),'white'); y=0
    for i in ims: out.paste(i,(0,y)); y+=i.height
    out.save('rev/'+name.replace(' ','_')+'.png')
if __name__=='__main__':
    for n in sys.argv[1:]: render(n)
