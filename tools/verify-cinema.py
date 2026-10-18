"""Resource, interruption and renderer acceptance checks for the coastal cinema."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from io import BytesIO
import json
import os
import sys
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'preview'
OUTPUT.mkdir(exist_ok=True)
sys.stdout.reconfigure(encoding='utf-8')
checks, errors = [], []
completed = False

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_): pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{server.server_port}/index.html'

def check(value, label):
    if not value: raise AssertionError(label)
    checks.append(label)
    print('PASS', label, flush=True)

def ready(page):
    page.wait_for_selector('#boot[hidden]', state='attached', timeout=25000)
    page.wait_for_function('!document.querySelector("#site-shell").inert', timeout=7000)

def settled(page, mode):
    page.wait_for_function('''mode=>document.body.dataset.view===mode&&document.body.dataset.route===location.hash&&!document.querySelector('#site-shell').inert&&!document.body.classList.contains('is-fragmenting')&&document.querySelector('#coast-stage').dataset.progress===(mode==='home'?'0.000':'1.000')''',arg=mode,timeout=8000)

def watch(page):
    page.on('pageerror', lambda e: errors.append(str(e)))

def water_sample(page):
    return page.evaluate('''()=>{const c=document.querySelector('#ocean-canvas'),ctx=c.getContext('2d'),data=ctx.getImageData(0,c.height*.6,c.width,80).data;let hash=0;for(let i=0;i<data.length;i+=13)hash=(hash*31+data[i])|0;return hash;}''')

def canvas_has_pixels(page):
    return page.evaluate('''()=>{const c=document.querySelector('#cinema-canvas');return c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)}''')

def watch_fragment_motion(page):
    # Observe triangles actually sent to Canvas, so a static particle cloud cannot pass.
    page.evaluate('''()=>{
      const c=document.querySelector('#cinema-canvas'),ctx=c.getContext('2d'),originals={};let path=[],points=[],previous=null,active=true;const samples=[];
      for(const name of ['moveTo','lineTo','fill','clearRect']){originals[name]=ctx[name];ctx[name]=function(...args){if(name==='clearRect')points=[];else if(name==='moveTo')path=[args];else if(name==='lineTo')path.push(args);else if(path.length===3)points.push(path.reduce((v,p)=>[v[0]+p[0]/3,v[1]+p[1]/3],[0,0]));return originals[name].apply(ctx,args);};}
      function sample(now){if(!active)return;const progress=+c.dataset.progress;if(c.dataset.phase.startsWith('flag-')&&points.length&&progress!==previous?.progress){if(previous&&points.length===previous.points.length&&progress>previous.progress){const displacement=points.reduce((s,p,i)=>s+(p[0]-previous.points[i][0])**2+(p[1]-previous.points[i][1])**2,0);samples.push({p:progress,speed:Math.sqrt(displacement/points.length)/(now-previous.now)*1000});}previous={progress,points,now};}requestAnimationFrame(sample);}
      requestAnimationFrame(sample);window.finishMotionProbe=()=>{active=false;for(const name in originals)ctx[name]=originals[name];return samples;};
    }''')

def continuous_handoff(page):
    samples=page.evaluate('window.finishMotionProbe()')
    middle=[s for s in samples if .28<s['p']<.46]
    return any(s['p']<.34 for s in middle) and any(s['p']>.34 for s in middle) and min(s['speed'] for s in middle)>10

try:
    with sync_playwright() as p:
        executable=os.environ.get('DENGTA_BROWSER')
        cached=Path(os.environ.get('LOCALAPPDATA',''))/'ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-win64/chrome-headless-shell.exe'
        if not executable and cached.exists(): executable=str(cached)
        browser=p.chromium.launch(executable_path=executable,headless=True,args=['--disable-webgl'])

        # Keep one real resource unresolved beyond the minimum assembly duration.
        delayed=browser.new_context(viewport={'width':1280,'height':800})
        held=[]
        delayed.route('**/dengta-town.webp',lambda route:held.append(route))
        page=delayed.new_page();watch(page)
        page.goto(URL,wait_until='domcontentloaded');page.wait_for_timeout(4100)
        state=page.locator('#cinema-canvas').evaluate('(e)=>({...e.dataset})')
        check(held and 0<float(state['progress'])<1 and int(state['assembled'])<int(state['pieces']),'A slow image keeps the lighthouse visibly incomplete')
        check(page.locator('#boot').is_visible() and page.locator('#site-shell').evaluate('(e)=>e.inert'),'Slow resources keep the coast controls locked')
        page.screenshot(path=str(OUTPUT/'cinema-slow-resource.png'))
        for route in held: route.continue_()
        tower=page.wait_for_function('''()=>{const c=document.querySelector('#cinema-canvas'),p=+c.dataset.progress;if(c.dataset.phase!=='landing'||p<.3||p>.7)return null;const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let x0=c.width,x1=0,y0=c.height,y1=0,count=0;for(let y=0;y<c.height;y+=2)for(let x=0;x<c.width;x+=2)if(data[(y*c.width+x)*4+3]>220){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);count++;}return {x:(x0+x1)/2,width:x1-x0,height:y1-y0,coverage:count*4/((x1-x0)*(y1-y0))};}''',timeout=8000).json_value()
        check(tower['width']<tower['height']*.5 and tower['coverage']>.45 and 640<tower['x']<1050,'Arrival moves a compact intact lighthouse between the centre and the coast')
        page.screenshot(path=str(OUTPUT/'cinema-intact-arrival.png'))
        ready(page)
        check(page.locator('.boot-meter').get_attribute('aria-valuenow')=='100' and canvas_has_pixels(page),'The loaded lighthouse arrives on the coast and progress completes')
        check(page.locator('#ocean-canvas').get_attribute('data-renderer')=='canvas','Devices without WebGL receive the Canvas water surface')
        before=water_sample(page);page.wait_for_timeout(450)
        check(water_sample(page)!=before,'Fallback water visibly changes over time')
        page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(100)
        before=water_sample(page);page.wait_for_timeout(350)
        check(water_sample(page)==before,'Reduced motion freezes the water surface')
        page.evaluate('scrollTo({top:500,behavior:"instant"})');page.wait_for_timeout(100)
        png=page.screenshot(path=str(OUTPUT/'cinema-threshold.png'))
        im=Image.open(BytesIO(png)).convert('RGB')
        # Same screen row: paper has arrived at the centre; sea/shore remain at the flanks.
        y=round(page.locator('.home-sections').bounding_box()['y']+70)
        centre=im.getpixel((640,y));left=im.getpixel((8,y));right=im.getpixel((1250,y))
        check(min(centre)>220 and max(abs(centre[i]-left[i]) for i in range(3))>50 and max(abs(centre[i]-right[i]) for i in range(3))>50,'Rounded shoreline transition retains visible coast on both sides')
        delayed.close()

        toggled=browser.new_context(viewport={'width':1000,'height':700})
        held=[];toggled.route('**/dengfu-city.webp',lambda route:held.append(route))
        page=toggled.new_page();watch(page);page.goto(URL,wait_until='domcontentloaded');page.wait_for_timeout(1300)
        page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(200)
        check(page.locator('#boot').is_visible() and page.locator('#site-shell').evaluate('(e)=>e.inert') and float(page.locator('#cinema-canvas').get_attribute('data-progress'))<1,'Changing motion preference still waits for actual resources')
        for route in held: route.continue_()
        ready(page)
        check(canvas_has_pixels(page),'A motion preference change preserves the final lighthouse')
        toggled.close()

        deep=browser.new_context(viewport={'width':1280,'height':800})
        page=deep.new_page();watch(page);page.goto(URL+'#/world/dengfu');ready(page)
        check(page.locator('#detail-content h1').inner_text()=='灯浮市' and page.locator('.flag-cloth img').is_visible() and not canvas_has_pixels(page),'First-visit deep links assemble the requested flag without leftover tower fragments')
        page.mouse.click(700,300,button='right')
        page.wait_for_function('document.querySelector("#cinema-canvas").dataset.phase==="return-fragments"')
        check(page.locator('#site-shell').evaluate('(e)=>e.inert'),'Reverse reconstruction keeps controls locked during the transfer')
        page.wait_for_timeout(400);page.screenshot(path=str(OUTPUT/'cinema-return-fragments.png'))
        settled(page,'home')
        check(canvas_has_pixels(page),'Returning from a deep link rebuilds the coast lighthouse')
        deep.close()

        repeat=browser.new_context(viewport={'width':1200,'height':800})
        repeat.add_init_script("localStorage.setItem('dengta-sand-intro-v2','yes')")
        page=repeat.new_page();watch(page);page.goto(URL,wait_until='domcontentloaded')
        page.evaluate("location.hash='/world/dengta'");settled(page,'detail')
        check(not page.locator('#site-shell').evaluate('(e)=>e.inert'),'Routing during returning-visitor arrival restores all controls')
        watch_fragment_motion(page)
        page.evaluate('''()=>{window.transferFrames=[];function sample(){const c=document.querySelector('#cinema-canvas'),f=document.querySelector('.flag-cloth img'),phase=c.dataset.phase;window.transferFrames.push({phase,progress:+c.dataset.progress,node:document.querySelector('.sea-node[aria-current]')?.dataset.nodeId,title:document.querySelector('#detail-content h1')?.innerText,contentOpacity:Math.min(...['.world-title','.archive'].map(selector=>+getComputedStyle(document.querySelector('#detail-content '+selector)).opacity)),flag:getComputedStyle(f).visibility,pixels:c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)});if(window.watchTransfer)requestAnimationFrame(sample);}window.watchTransfer=true;requestAnimationFrame(sample);}''')
        page.evaluate("location.hash='/world/dengzhu'");settled(page,'detail')
        check(continuous_handoff(page),'Rendered desktop fragments keep moving through the page handoff')
        frames=page.evaluate('window.watchTransfer=false;window.transferFrames')
        moving=[f for f in frames if f['phase'] in ['flag-dissolving','flag-rebuilding']]
        check(len(moving)>5 and all(f['flag']=='hidden' and f['pixels'] for f in moving),'Every sampled switch frame shows fragments while the DOM flag stays hidden')
        check(any(f['phase']=='flag-dissolving' for f in moving) and all(f['node']=='dengta' and f['title']=='灯塔镇' for f in moving if f['phase']=='flag-dissolving'),'The full dissolution takes place in the original server page')
        check(any(f['phase']=='flag-rebuilding' for f in moving) and all(f['node']=='dengzhu' and f['title']=='灯筑城' for f in moving if f['phase']=='flag-rebuilding'),'Reconstruction uses the new page and its selected navigation together')
        early=[f for f in moving if f['phase']=='flag-rebuilding' and .38<f['progress']<.41]
        check(early and all(f['contentOpacity']>.001 for f in early),'Incoming text starts while fragments are moving without an extra hold')
        late=[f for f in moving if f['phase']=='flag-rebuilding' and f['progress']>.94]
        check(late and all(f['contentOpacity']>.98 for f in late),'Incoming text settles before the flag finishes without an end-of-animation jump')
        check(not canvas_has_pixels(page) and page.locator('.flag-cloth img').is_visible(),'The finished switch reveals one clean flag without a fragment overlay')
        page.evaluate("location.hash='/world/dengfu'");page.wait_for_function('document.querySelector("#cinema-canvas").dataset.phase==="flag-dissolving"')
        page.set_viewport_size({'width':1100,'height':750});settled(page,'detail')
        check(page.locator('#detail-content h1').inner_text()=='灯浮市','Resizing during dissolution commits the requested server and unlocks')
        page.evaluate("location.hash='/world/denghuo'");page.wait_for_function('document.querySelector("#cinema-canvas").dataset.phase==="flag-dissolving"')
        page.emulate_media(reduced_motion='reduce');settled(page,'detail')
        check(page.locator('#detail-content h1').inner_text()=='灯火乡','Reduced motion during dissolution still opens the requested server')
        page.emulate_media(reduced_motion='no-preference')
        page.evaluate("location.hash='/world/dengzhu';setTimeout(()=>location.hash='/world/dengfu',120);setTimeout(()=>location.hash='/world/dengta',240)");page.wait_for_timeout(300);settled(page,'detail')
        check(page.locator('#detail-content h1').inner_text()=='灯塔镇' and not canvas_has_pixels(page),'Superseded server switches never commit their stale destination')
        page.evaluate("location.hash='/home';setTimeout(()=>location.hash='/world/dengzhu',180);setTimeout(()=>location.hash='/home',370);setTimeout(()=>location.hash='/world/denghuo',550)")
        page.wait_for_timeout(650);settled(page,'detail')
        check(page.locator('#detail-content h1').inner_text()=='灯火乡' and not canvas_has_pixels(page),'Interrupted forward and reverse transfers settle on the last route')
        page.evaluate("location.hash='/home'");settled(page,'home')
        page.evaluate("location.hash='/world/dengzhu'")
        page.wait_for_function('document.body.classList.contains("is-fragmenting")')
        page.set_viewport_size({'width':800,'height':1000});settled(page,'detail')
        check(page.locator('.flag-cloth img').is_visible() and not canvas_has_pixels(page),'Resizing during a transfer finishes cleanly at the new layout')
        page.evaluate("location.hash='/home'");page.wait_for_function('document.body.classList.contains("is-fragmenting")')
        page.emulate_media(reduced_motion='reduce');settled(page,'home')
        check(canvas_has_pixels(page),'Enabling reduced motion during a transfer reaches the final scene')
        repeat.close()

        mobile=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
        page=mobile.new_page();watch(page);page.goto(URL,wait_until='domcontentloaded');page.wait_for_timeout(900)
        check(page.locator('#cinema-canvas').get_attribute('data-phase')=='assembling','Mobile first visits assemble the same lighthouse')
        page.set_viewport_size({'width':844,'height':390});ready(page)
        check(not page.locator('#site-shell').evaluate('(e)=>e.inert') and canvas_has_pixels(page),'Rotating a phone during assembly completes without blocking')
        page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(250)
        page.screenshot(path=str(OUTPUT/'cinema-mobile.png'))
        page.locator('[data-node-id="dengta"]').tap(force=True)
        state=page.wait_for_function('''()=>{const e=document.querySelector('#cinema-canvas');return e.dataset.phase==='flag-fragments'?+e.dataset.fragments:null}''').json_value()
        check(state>=200,'Mobile server entry retains hundreds of triangle fragments')
        settled(page,'detail')
        check(page.locator('.flag-cloth img').is_visible() and not canvas_has_pixels(page),'Mobile fragments leave one clean, usable server page')
        watch_fragment_motion(page)
        page.locator('[data-node-id="dengzhu"]').tap(force=True);settled(page,'detail')
        check(continuous_handoff(page),'Rendered mobile fragments keep moving through the page handoff')
        mobile.close()

        failed=browser.new_context(viewport={'width':1000,'height':700})
        failed.route('**/*.webp',lambda route:route.abort())
        page=failed.new_page();watch(page);page.goto(URL);page.locator('#boot-skip').click();ready(page)
        check('部分图像暂不可用' in page.locator('#boot-status').inner_text() and canvas_has_pixels(page),'Failed images still finish the cinematic arrival')
        failed.close();browser.close()

        browser=p.chromium.launch(executable_path=executable,headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        page=browser.new_page(viewport={'width':900,'height':650});watch(page)
        page.add_init_script("localStorage.setItem('dengta-sand-intro-v2','yes')")
        page.goto(URL);ready(page)
        check(page.evaluate('window.coast3D?.active&&window.coast3D.renderer.isWebGLRenderer'),'A supported device starts the Three.js coast')
        page.evaluate("window.coast3D.renderer.getContext().getExtension('WEBGL_lose_context').loseContext()")
        page.wait_for_function('document.querySelector("#ocean-canvas").dataset.renderer==="canvas"')
        page.wait_for_timeout(150);before=water_sample(page);page.wait_for_timeout(400)
        check(water_sample(page)!=before,'Losing the graphics context switches to animated Canvas water')
        page.locator('[data-node-id="dengta"]').click(force=True);settled(page,'detail')
        check(page.locator('#detail-content h1').inner_text()=='灯塔镇','Server navigation remains usable after graphics context loss')
        browser.close()
        check(not errors,'No runtime errors in resource and interruption scenarios')
        completed=True
finally:
    server.shutdown()
    (OUTPUT/'cinema-verification.json').write_text(json.dumps({'status':'passed' if completed else 'failed','checks':checks,'passed':len(checks),'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Completed {len(checks)} cinema checks.',flush=True)
