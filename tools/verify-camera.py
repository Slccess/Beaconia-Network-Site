"""Check the moving camera against rendered navigation, birds and interactions."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
import json
import math
import os
import sys
from io import BytesIO
import base64
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'preview'
OUTPUT.mkdir(exist_ok=True)
sys.stdout.reconfigure(encoding='utf-8')
checks, errors, samples = [], [], []
completed = False
door_samples = []
cycle_samples = []


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{server.server_port}/index.html'


def check(value, label):
    if not value:
        raise AssertionError(label)
    checks.append(label)
    print('PASS', label, flush=True)


def ready(page):
    page.wait_for_function('document.querySelector("#boot").hidden&&!document.querySelector("#site-shell").inert', timeout=40000)


def settled(page, view):
    page.wait_for_function('''view=>document.body.dataset.view===view&&document.body.dataset.route===location.hash&&!document.querySelector('#site-shell').inert&&!document.body.classList.contains('is-fragmenting')&&document.querySelector('#coast-stage').dataset.progress===(view==='home'?'0.000':'1.000')''', arg=view, timeout=15000)


def sample(page):
    return page.evaluate('''()=>{
      const c=window.coast3D,stage=document.querySelector('#coast-stage').getBoundingClientRect();
      const ray=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),2.45);
      const land=c.scene.getObjectByName('Solid coastal headland');
      c.scene.updateMatrixWorld(true);
      let lineError=0,scaleError=0;const landHits=[],nodes=[];
      const distance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
      for(const ring of ['inner','outer']){
        const path=document.querySelector(`[data-wave="${ring}"] .wave-line`).getAttribute('d');
        const points=[...path.matchAll(/[ML](-?[\\d.]+),(-?[\\d.]+)/g)].map(m=>[+m[1],+m[2]]);
        for(const node of document.querySelectorAll(`#${ring}-nodes .sea-node:not([hidden])`)){
          const r=node.getBoundingClientRect(),x=r.x+r.width/2-stage.x,y=r.y+r.height/2-stage.y;
          lineError=Math.max(lineError,Math.min(...points.slice(1).map((b,i)=>distance([x,y],points[i],b))));
          ray.setFromCamera(new THREE.Vector2(x/stage.width*2-1,1-y/stage.height*2),c.camera);
          const world=ray.ray.intersectPlane(plane,new THREE.Vector3());
          const refDepth=-world.clone().applyMatrix4(c.referenceCamera.matrixWorldInverse).z;
          const liveDepth=-world.clone().applyMatrix4(c.camera.matrixWorldInverse).z;
          scaleError=Math.max(scaleError,Math.abs(r.width/44-refDepth/liveDepth));
          if(ray.intersectObject(land,true).length)landHits.push(node.dataset.nodeId);
          nodes.push({id:node.dataset.nodeId,x,y,scale:r.width/44});
        }
      }
      const birds=[...document.querySelectorAll('.goose')].map(e=>{const r=e.getBoundingClientRect(),m=new DOMMatrix(getComputedStyle(e).transform);return {x:r.x+r.width/2,y:r.y+r.height/2,scale:Math.hypot(m.a,m.b)};});
      const headline=document.querySelector('.hero-copy h1'),copy=document.querySelector('.hero-copy').getBoundingClientRect();
      const tower=c.scene.getObjectByName('Shared sand and coast lighthouse');
      const foot=c.projectWorld(tower.localToWorld(new THREE.Vector3(0,0,0)));
      return {viewport:[innerWidth,innerHeight],foot,pose:c.inspect().cameraPose,camera:c.camera.matrixWorld.toArray(),lineError,scaleError,landHits,nodes,birds,
        headlineGap:c.inspect().horizon-headline.getBoundingClientRect().bottom,
        captionGap:document.querySelector('.inner-caption').getBoundingClientRect().top-copy.bottom,
        headerGap:copy.top-document.querySelector('.coast-brand').getBoundingClientRect().bottom,
        sky:c.scene.getObjectByName('Dusk atmosphere').material.uniforms.uSkyProjection.value.toArray(),
        overflow:document.documentElement.scrollWidth>innerWidth+1};
    }''')


def inspect_door(page):
    # Inspect actual rasterized gold pixels across the door, including its upper
    # half where the old mesh produced intermittent dark horizontal stripes.
    result = page.evaluate('''()=>{
      const c=coast3D,saved=c.camera.clone(),tower=c.scene.getObjectByName('Shared sand and coast lighthouse');
      const bitmap=document.createElement('canvas');bitmap.width=c.renderer.domElement.width;bitmap.height=c.renderer.domElement.height;
      const ctx=bitmap.getContext('2d',{willReadFrequently:true}),frames=[];
      const project=(x,y,z)=>{const p=tower.localToWorld(new THREE.Vector3(x,y,z)).project(c.camera);return {x:(p.x+1)*bitmap.width/2,y:(1-p.y)*bitmap.height/2};};
      for(let i=0;i<48;i++){
        const phase=i/47*Math.PI*2,yaw=Math.sin(phase)*.07,pitch=.28+Math.cos(phase)*.008,distance=80+Math.sin(phase*.7)*1.8,track=Math.sin(phase)*.8;
        c.camera.position.set(track+Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,Math.cos(yaw)*Math.cos(pitch)*distance);
        c.camera.lookAt(track,0,0);c.camera.updateMatrixWorld();c.flush();
        ctx.clearRect(0,0,bitmap.width,bitmap.height);ctx.drawImage(c.renderer.domElement,0,0);
        const pixels=ctx.getImageData(0,0,bitmap.width,bitmap.height).data;
        let dark=0,total=0;
        for(let row=0;row<15;row++)for(let col=0;col<7;col++){
          const x=-.055+col*.11/6,y=.29+row*.44/14,z=.64+(.31-.64)*(y-.22)/3.38+.036;
          const p=project(x,y,z),offset=(Math.floor(p.y)*bitmap.width+Math.floor(p.x))*4;
          const r=pixels[offset],g=pixels[offset+1],b=pixels[offset+2];
          if(!(r>90&&r>g*1.08&&g>b*1.2))dark++;total++;
        }
        const frame={index:i,yaw,dark,total};
        if(i%6===0){
          const a=project(-.16,.18,.68),b=project(.16,.86,.63),x=Math.floor(Math.min(a.x,b.x)-5),y=Math.floor(Math.min(a.y,b.y)-5);
          const crop=document.createElement('canvas');crop.width=Math.ceil(Math.abs(a.x-b.x)+10);crop.height=Math.ceil(Math.abs(a.y-b.y)+10);
          crop.getContext('2d').drawImage(bitmap,x,y,crop.width,crop.height,0,0,crop.width,crop.height);frame.image=crop.toDataURL();
        }
        frames.push(frame);
      }
      c.camera.copy(saved);c.camera.updateMatrixWorld();c.flush();return frames;
    }''')
    sheet=Image.new('RGB',(8*140,230),(25,38,45));draw=ImageDraw.Draw(sheet)
    for frame in result:
        if 'image' in frame:
            crop=Image.open(BytesIO(base64.b64decode(frame.pop('image').split(',')[1]))).convert('RGB')
            ratio=min(132/crop.width,200/crop.height)
            crop=crop.resize((round(crop.width*ratio),round(crop.height*ratio)),Image.Resampling.NEAREST)
            x=frame['index']//6*140
            sheet.paste(crop,(x,25));draw.text((x+4,6),f'frame {frame["index"]}',fill='white')
    sheet.save(OUTPUT/'camera-door-stability.png')
    door_samples.extend(result)
    check(all(f['dark']==0 for f in result), 'The door has no dark depth stripes in 48 rendered camera positions')


def inspect_cycle(page):
    # Advance the actual camera controller through full cycles at all four
    # pointer corners. Check world anchors even between the rendered snapshots.
    result=page.evaluate('''()=>{
      const c=coast3D,ray=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),2.45),stage=document.querySelector('#coast-stage').getBoundingClientRect();
      const anchors=[...document.querySelectorAll('.sea-node:not([hidden])')].map(n=>{
        const r=n.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2((r.x+r.width/2)/stage.width*2-1,1-(r.y+r.height/2)/stage.height*2),c.camera);
        const label=n.querySelector('.node-label').getBoundingClientRect(),scale=r.width/44;
        return {id:n.dataset.nodeId,p:ray.ray.intersectPlane(plane,new THREE.Vector3()),label:[(label.x-r.x-r.width/2)/scale,(label.y-r.y-r.height/2)/scale,label.width/scale,label.height/scale]};
      });
      let headerGap=Infinity,captionGap=Infinity,waterMargin=Infinity,hits=[],outside=[],captionHits=[],minX=Infinity,now=performance.now();
      for(const [x,y] of [[0,0],[1,0],[1,1],[0,1]]){
        c.pointer(x,y);
        for(let i=0;i<450;i++){
          now+=80;c.updateCamera(now,true);if(i%10)continue;
          const copy=document.querySelector('.hero-copy').getBoundingClientRect(),headline=document.querySelector('.hero-copy h1');
          headerGap=Math.min(headerGap,copy.top-document.querySelector('.coast-brand').getBoundingClientRect().bottom);
          captionGap=Math.min(captionGap,document.querySelector('.inner-caption').getBoundingClientRect().top-copy.bottom);
          waterMargin=Math.min(waterMargin,c.inspect().horizon-headline.getBoundingClientRect().bottom);
          for(const a of anchors){
            const s=c.projectWorld(a.p);ray.setFromCamera(new THREE.Vector2(s.x/stage.width*2-1,1-s.y/stage.height*2),c.camera);
            if(ray.intersectObject(c.scene.getObjectByName('Solid coastal headland'),true).length)hits.push(a.id);
            minX=Math.min(minX,s.x);
            if(s.x<22||s.x>stage.width-22||s.y<22||s.y>stage.height-22)outside.push(a.id);
            const label={x:s.x+a.label[0]*s.scale,y:s.y+a.label[1]*s.scale,w:a.label[2]*s.scale,h:a.label[3]*s.scale};
            for(const e of document.querySelectorAll('.ring-caption')){
              if(getComputedStyle(e).visibility==='hidden')continue;
              const r=e.getBoundingClientRect();
              if(label.x<r.right&&label.x+label.w>r.left&&label.y<r.bottom&&label.y+label.h>r.top)captionHits.push(a.id);
            }
          }
        }
      }
      c.pointer(.5,.5);return {viewport:[innerWidth,innerHeight],headerGap,captionGap,waterMargin:Number.isFinite(waterMargin)?waterMargin:null,minX,hits:[...new Set(hits)],outside:[...new Set(outside)],captionHits:[...new Set(captionHits)]};
    }''')
    cycle_samples.append(result)
    w,h=result['viewport']
    check(result['headerGap']>=0 and result['captionGap']>=23.9 and (result['waterMargin'] is None or result['waterMargin']>2.8), f'Full camera cycles preserve title, caption and horizon spacing at {w}x{h}')
    check(not result['hits'] and not result['outside'], f'Full camera cycles keep all node targets on visible water at {w}x{h}')
    check(not result['captionHits'], f'Camera movement keeps node names clear of visible ring captions at {w}x{h}')


try:
    with sync_playwright() as p:
        executable = os.environ.get('DENGTA_BROWSER')
        cached = Path(os.environ.get('LOCALAPPDATA', '')) / 'ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-win64/chrome-headless-shell.exe'
        if not executable and cached.exists():
            executable = str(cached)
        browser = p.chromium.launch(executable_path=executable, headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width':1440,'height':900}, reduced_motion='reduce')
        page = context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(URL);ready(page)
        check(page.evaluate('window.coast3D.camera.isPerspectiveCamera'), 'The coast uses a perspective camera')
        rest = sample(page)
        check(rest['lineError'] < 1 and not rest['landHits'], 'Resting nodes sit on their waves over water')
        inspect_door(page)
        page.screenshot(path=str(OUTPUT/'camera-desktop-rest.png'))
        page.emulate_media(reduced_motion='no-preference')
        page.mouse.move(720,450)
        before = sample(page)
        page.wait_for_timeout(4000)
        drift = sample(page);samples.append(drift)
        check(math.hypot(drift['foot']['x']-before['foot']['x'],drift['foot']['y']-before['foot']['y'])>=15, 'Idle camera movement visibly shifts the lighthouse by at least 15px in four seconds')
        page.screenshot(path=str(OUTPUT/'camera-desktop-moving.png'))
        pointer_samples=[]
        for x,y in [(50,120),(1380,120),(1380,780),(50,780)]:
            page.mouse.move(x,y);page.wait_for_timeout(1200)
            state = sample(page);samples.append(state);pointer_samples.append(state)
            check(state['lineError'] < 1, f'Projected nodes stay on both moving waves at pointer {x},{y}')
            check(state['scaleError'] < .0002, f'Node size follows perspective depth at pointer {x},{y}')
            check(not state['landHits'], f'Camera movement keeps server nodes off the cliff at pointer {x},{y}')
            check(state['headlineGap'] > 2.8 and state['captionGap'] > 23 and state['headerGap'] >= 0, f'Text stays above the moving horizon at pointer {x},{y}')
        check(any(abs(s['pose']['yaw'])>.001 for s in samples), 'Pointer movement steers the actual camera')
        check(max(s['foot']['x'] for s in pointer_samples)-min(s['foot']['x'] for s in pointer_samples)>35, 'Pointer steering visibly shifts the lighthouse by more than 35px')
        check(all(abs(s['pose']['yaw'])<.064 and abs(s['pose']['pitch'])<.009 and abs(s['pose']['dolly'])<1.81 and abs(s['pose']['track'])<.81 for s in samples), 'Camera movement stays inside the composed orbit and tracking bounds')
        check(any(abs(a['scale']-b['scale'])>.0001 for a,b in zip(samples[0]['birds'],samples[-1]['birds'])), 'Birds change apparent size with camera depth')
        check(samples[0]['sky'] != samples[-1]['sky'], 'The sky uses the moving camera orientation')
        check(page.evaluate('''()=>{
          const c=window.coast3D,a=c.skyAnchor(700,180,90),b=c.skyAnchor(700,180,160),pa=a.clone().project(c.camera),pb=b.clone().project(c.camera);
          const projected=c.projectWorld(a),r=document.querySelector('#coast-stage').getBoundingClientRect();
          return pa.distanceTo(pb)>.0001&&Math.abs(projected.x-(pa.x+1)*r.width/2)<.01&&Math.abs(projected.y-(1-pa.y)*r.height/2)<.01;
        }'''), 'Different world depths produce different screen motion through the Three.js camera')
        page.screenshot(path=str(OUTPUT/'camera-desktop.png'))
        page.locator('[data-node-id="dengzhu"]').hover(force=True)
        # The screen beam and 3D light now share a smooth target. Check that it
        # reaches the moving node, then independently check its water projection.
        page.wait_for_function('''()=>{
          const c=window.coast3D,s=c.scene.getObjectByName('Interactive lighthouse beam'),p=c.projectWorld(s.target.position);
          const r=document.querySelector('[data-node-id="dengzhu"]').getBoundingClientRect(),stage=document.querySelector('#coast-stage');
          const bounds=stage.getBoundingClientRect();
          return stage.dataset.lightTarget==='dengzhu'&&Math.hypot(p.x-(r.x+r.width/2-bounds.x),p.y-(r.y+r.height/2-bounds.y))<3;
        }''', timeout=2500)
        check(True, 'The shared light settles within 3px of the moving node')
        check(page.evaluate('''()=>{
          const c=window.coast3D,stage=document.querySelector('#coast-stage'),ray=new THREE.Raycaster();
          ray.setFromCamera(new THREE.Vector2(Number(stage.dataset.lightX)/stage.clientWidth*2-1,1-Number(stage.dataset.lightY)/stage.clientHeight*2),c.camera);
          const hit=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),2.45),new THREE.Vector3());
          const light=c.scene.getObjectByName('Interactive lighthouse beam');
          return light.userData.surface==='water'&&hit.distanceTo(light.target.position)<.002;
        }'''), 'The node spotlight and screen beam share the same water-plane target')
        node = page.locator('[data-node-id="dengta"]').bounding_box()
        page.mouse.click(node['x']+node['width']/2,node['y']+node['height']/2)
        page.wait_for_function('document.body.classList.contains("is-fragmenting")')
        held = page.evaluate('window.coast3D.camera.matrixWorld.toArray()')
        page.mouse.move(1400,60);page.wait_for_timeout(400)
        check(held == page.evaluate('window.coast3D.camera.matrixWorld.toArray()'), 'The camera holds its pose during the flag handoff')
        settled(page,'detail')
        check(page.locator('#detail-content h1').inner_text()=='灯塔镇', 'Clicking the moving node opens the correct server')
        check(page.evaluate('''()=>{const c=document.querySelector('#cinema-canvas');return !c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)}'''), 'The moving-camera handoff leaves no triangle pixels over the archive')
        positions = page.locator('#inner-nodes').evaluate('e=>[...e.children].map(n=>n.style.transform)')
        page.mouse.move(20,850);page.wait_for_timeout(300)
        check(positions == page.locator('#inner-nodes').evaluate('e=>[...e.children].map(n=>n.style.transform)'), 'The detail navigation remains stable')
        page.keyboard.press('Escape');settled(page,'home')
        check(sample(page)['lineError']<1, 'Returning from the archive restores attached wave nodes')
        page.wait_for_timeout(500)
        check(held != page.evaluate('window.coast3D.camera.matrixWorld.toArray()'), 'Gentle camera movement resumes after returning')
        context.route('http://camera-foreign.test/flag.webp', lambda route: route.fulfill(path=str(ROOT/'assets/dengta-town.webp'), content_type='image/webp'))
        tainted=page.evaluate('''async()=>{
          const img=new Image();img.src='http://camera-foreign.test/flag.webp';await img.decode();
          const ctx=document.querySelector('#cinema-canvas').getContext('2d');ctx.drawImage(img,0,0,10,10);
          try{ctx.getImageData(0,0,1,1);return false;}catch(error){return error.name==='SecurityError';}
        }''')
        check(tainted,'External flag coverage uses an actual cross-origin canvas bitmap')
        page.locator('[data-node-id="dengfu"]').click(force=True);settled(page,'detail')
        check(page.evaluate('''()=>{const c=document.querySelector('#cinema-canvas');return !c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)}'''), 'A cross-origin fragment bitmap clears safely when the handoff ends')
        page.keyboard.press('Escape');settled(page,'home')
        for w,h in [(1440,900),(1366,768),(1920,800),(2560,1080),(1024,768),(1024,600),(768,1024),(390,844),(320,568),(844,390)]:
            page.set_viewport_size({'width':w,'height':h});page.mouse.move(w*.9,h*.2);page.wait_for_timeout(1500)
            state=sample(page);samples.append(state)
            check(state['lineError']<1 and not state['landHits'] and not state['overflow'], f'Waves and nodes stay aligned and clear of land at {w}x{h}')
            check(state['headlineGap'] is None or state['headlineGap']>2.8, f'The headline stays above the horizon at {w}x{h}')
            if w==390:page.screenshot(path=str(OUTPUT/'camera-mobile.png'))
            inspect_cycle(page)
        page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(300)
        frozen=sample(page);page.wait_for_timeout(500)
        after=sample(page)
        check(frozen['camera']==after['camera'] and frozen['nodes']==after['nodes'] and frozen['birds']==after['birds'], 'Reduced motion freezes the camera, wave nodes and birds')
        page.mouse.move(30,40);page.wait_for_timeout(250)
        check(frozen['camera']==sample(page)['camera'], 'Pointer motion does not move a reduced-motion camera')
        page.evaluate('window.coast3D.renderer.getContext().getExtension("WEBGL_lose_context").loseContext()')
        page.wait_for_function('!window.coast3D.active')
        check(page.evaluate('''()=>!document.querySelector('#site-shell').style.getPropertyValue('--coast-horizon')&&[...document.querySelectorAll('.goose')].every(e=>!e.style.transform)'''), 'Graphics fallback clears camera offsets and restores the flat layout')
        page.locator('[data-node-id="dengta"]').click(force=True);settled(page,'detail')
        check(page.locator('#detail-content h1').inner_text()=='灯塔镇', 'Navigation works after camera rendering falls back')
        browser.close()
        check(not errors,'No runtime errors during camera acceptance')
        completed=True
finally:
    server.shutdown()
    (OUTPUT/'camera-verification.json').write_text(json.dumps({'status':'passed' if completed else 'failed','passed':len(checks),'checks':checks,'errors':errors,'samples':samples,'door_samples':door_samples,'cycle_samples':cycle_samples},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Completed {len(checks)} camera checks.',flush=True)
