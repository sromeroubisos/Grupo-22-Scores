import fitz, sys, os, json, glob, re, numpy as np
from multiprocessing import Pool
D = os.environ.get('TARJETAS_DIR', 'tarjetas/').rstrip('/') + '/'
OUT='ocrraw/'
_ocr=None
def get():
    global _ocr
    if _ocr is None:
        from rapidocr_onnxruntime import RapidOCR
        _ocr=RapidOCR(text_score=0.2, box_thresh=0.3, unclip_ratio=1.8)
    return _ocr
def rows_of(img, tol=18):
    res,_=get()(img)
    if not res: return []
    items=sorted([(b[0][1],b[0][0],txt) for b,txt,c in res])
    rows=[]
    for y,x,t in items:
        if rows and abs(rows[-1][0]-y)<tol: rows[-1][1].append((x,t))
        else: rows.append([y,[(x,t)]])
    return [[t for x,t in sorted(r)] for y,r in rows]
def work(f):
    for intento in range(3):
        try:
            return work1(f)
        except Exception as e:
            global _ocr
            _ocr=None
            err=repr(e)[:80]
    return os.path.basename(f)[:-4]+' FALLO '+err
def work1(f):
    name=os.path.basename(f)[:-4]
    d=fitz.open(f)
    out={'file':name,'pages':[]}
    for pi in range(len(d)):
        pm=d[pi].get_pixmap(dpi=300 if pi==0 else 150)
        img=np.frombuffer(pm.samples,dtype=np.uint8).reshape(pm.h,pm.w,pm.n)[:,:,:3]
        H,W=img.shape[:2]
        if pi==0:
            out['top']=rows_of(img[:int(H*0.13)])
            body=img[int(H*0.13):]
            out['left']=rows_of(body[:,:W//2])
            out['right']=rows_of(body[:,W//2:])
        else:
            out['pages'].append({'full':rows_of(img)})
    json.dump(out,open(OUT+name+'.json','w',encoding='utf-8'),ensure_ascii=False)
    return name
if __name__=='__main__':
    fs=sorted(glob.glob(D+'*.pdf'))
    fs=[f for f in fs if not os.path.exists(OUT+os.path.basename(f)[:-4]+'.json')]
    with Pool(3) as p:
        for n in p.imap_unordered(work,fs): print('ok',n.encode('ascii','replace').decode(),flush=True)
