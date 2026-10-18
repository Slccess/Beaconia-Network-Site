"""Acceptance checks for the Three.js coast and its existing cinematic handoffs."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from io import BytesIO
import base64
import json
import os
import sys
from PIL import Image, ImageChops, ImageStat
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'preview'
OUTPUT.mkdir(exist_ok=True)
sys.stdout.reconfigure(encoding='utf-8')
checks,errors=[],[]
completed=False

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*_): pass

server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{server.server_port}/index.html'

def check(value,label):
    if not value: raise AssertionError(label)
    checks.append(label)
    print('PASS',label,flush=True)

def ready(page):
    page.wait_for_function('document.querySelector("#boot").hidden&&!document.querySelector("#site-shell").inert',timeout=40000)

def settled(page):
    page.wait_for_function('document.body.dataset.route===location.hash&&!document.querySelector("#site-shell").inert&&!document.body.classList.contains("is-fragmenting")',timeout=12000)

def water_pixels(page):
    png=page.evaluate('window.coast3D.flush();document.querySelector("#three-canvas").toDataURL()')
    im=Image.open(BytesIO(base64.b64decode(png.split(',')[1]))).convert('RGB')
    w,h=im.size
    return im.crop((int(w*.08),int(h*.68),int(w*.40),int(h*.90)))

def node_land_hits(page):
    return page.evaluate('''()=>{
      const c=window.coast3D,r=new THREE.Raycaster(),hits=[];
      c.scene.updateMatrixWorld(true);c.camera.updateMatrixWorld(true);
      const land=c.scene.getObjectByName('Solid coastal headland');
      for(const node of document.querySelectorAll('.sea-node:not([hidden])')){
        const box=node.getBoundingClientRect(),x=box.left+22,y=box.top+22;
        r.setFromCamera(new THREE.Vector2(x/innerWidth*2-1,1-y/innerHeight*2),c.camera);
        if(r.intersectObject(land,true).length)hits.push(node.dataset.nodeId);
      }
      return hits;
    }''')

try:
    with sync_playwright() as p:
        executable=os.environ.get('DENGTA_BROWSER')
        cached=Path(os.environ.get('LOCALAPPDATA',''))/'ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-win64/chrome-headless-shell.exe'
        if not executable and cached.exists(): executable=str(cached)
        browser=p.chromium.launch(executable_path=executable,headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        context=browser.new_context(viewport={'width':1440,'height':900},device_scale_factor=1)
        requests=[]
        context.on('request',lambda request: requests.append(request.url))
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
        page.goto(URL,wait_until='domcontentloaded')
        page.wait_for_function('window.coast3D?.active&&document.querySelector("#cinema-canvas").dataset.phase==="assembling"')
        check(page.evaluate('window.coast3D.renderer.isWebGLRenderer&&window.coast3D.scene.isScene'),'The coast uses a real Three.js renderer and scene')
        tower_id=page.evaluate('window.coast3D.scene.getObjectByName("Shared sand and coast lighthouse").uuid')
        check(page.locator('#three-canvas').evaluate('e=>e.parentElement===document.body') and page.locator('#site-shell').evaluate('e=>e.inert'),'Three-dimensional sand assembly stays above the prologue and locks interaction')
        page.wait_for_function('''()=>{const c=document.querySelector('#cinema-canvas');return c.dataset.phase==='assembling'&&+c.dataset.progress>.3&&+c.dataset.progress<.9}''')
        page.screenshot(path=str(OUTPUT/'three-assembly.png'))
        page.wait_for_function('''()=>{const c=document.querySelector('#cinema-canvas');return c.dataset.phase==='landing'&&+c.dataset.progress>.3&&+c.dataset.progress<.8}''')
        check(page.evaluate('''()=>{const t=window.coast3D.scene.getObjectByName('Shared sand and coast lighthouse');return t.visible&&t.children.filter(o=>o.isMesh).length===3&&t.scale.x>0}'''),'The assembled 3D lighthouse moves intact during arrival')
        page.screenshot(path=str(OUTPUT/'three-arrival.png'))
        ready(page)
        check(page.evaluate('window.coast3D.scene.getObjectByName("Shared sand and coast lighthouse").uuid')==tower_id,'The coast keeps the same lighthouse object used during assembly')
        check(page.locator('#three-canvas').evaluate('e=>e.parentElement.classList.contains("coast-art")&&!e.classList.contains("is-prologue")'),'Arrival places the renderer behind the usable coast controls')
        check(page.locator('.shore-art').evaluate('e=>getComputedStyle(e).visibility')=='hidden','SVG shore artwork is hidden while the three-dimensional coast is active')
        scene=page.evaluate('window.coast3D.inspect()')
        check(scene['meshes']>30 and scene['triangles']>10000 and scene['waterVertices']>5000,'The coast contains solid geometry and a subdivided water surface')
        check(node_land_hits(page)==[],'Desktop server nodes stay over water rather than solid land')
        page.screenshot(path=str(OUTPUT/'three-desktop.png'))
        before=water_pixels(page);page.wait_for_timeout(550);after=water_pixels(page)
        check(sum(ImageStat.Stat(ImageChops.difference(before,after)).mean)>1,'Rendered Three.js water pixels move over time')
        page.locator('[data-node-id="dengzhu"]').hover(force=True);page.wait_for_timeout(500)
        check(page.evaluate('''()=>{const s=window.coast3D.scene.getObjectByName('Interactive lighthouse beam');return s.isSpotLight&&s.color.r>s.color.b&&s.target.position.length()>1}'''),'Hover steers an actual Three.js spotlight with the server theme')
        page.screenshot(path=str(OUTPUT/'three-theme-light.png'))
        page.mouse.move(20,60);page.wait_for_timeout(350)
        page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(250)
        before=water_pixels(page);page.wait_for_timeout(350);after=water_pixels(page)
        check(ImageChops.difference(before,after).getbbox() is None,'Reduced motion freezes the actual Three.js water image')
        page.emulate_media(reduced_motion='no-preference')
        page.locator('[data-node-id="dengta"]').click(force=True)
        page.wait_for_function('document.querySelector("#cinema-canvas").dataset.phase==="flag-fragments"')
        check(page.evaluate('''()=>!window.coast3D.scene.getObjectByName('Shared sand and coast lighthouse').visible&&document.querySelector('#cinema-canvas').getContext('2d').getImageData(0,0,innerWidth,innerHeight).data.some((v,i)=>i%4===3&&v>0)'''),'Flag fragments replace the 3D tower without leaving a second full tower')
        page.screenshot(path=str(OUTPUT/'three-flag-transfer.png'));settled(page)
        check(page.locator('#detail-content h1').inner_text()=='灯塔镇' and page.locator('.flag-cloth img').is_visible(),'The Three.js coast enters the existing server archive')
        page.wait_for_timeout(250)
        count=page.evaluate('window.coast3D.inspect().renderCount');page.wait_for_timeout(350)
        check(page.evaluate('window.coast3D.inspect().renderCount')==count,'The hidden 3D renderer rests while reading a server archive')
        page.locator('[data-node-id="dengzhu"]').click(force=True);settled(page)
        check(page.locator('#detail-content h1').inner_text()=='灯筑城','Direct archive switching remains usable with the Three.js scene loaded')
        page.keyboard.press('Escape');settled(page)
        check(page.evaluate('window.coast3D.scene.getObjectByName("Shared sand and coast lighthouse").visible'),'Returning reconstructs the three-dimensional lighthouse')
        page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(500)
        check(node_land_hits(page)==[],'Mobile server nodes remain over water beside the 3D headland')
        check(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'The Three.js coast fits a portrait phone')
        page.screenshot(path=str(OUTPUT/'three-mobile.png'))
        page.evaluate('window.coast3D.renderer.getContext().getExtension("WEBGL_lose_context").loseContext()')
        page.wait_for_function('!window.coast3D.active&&document.querySelector("#ocean-canvas").dataset.renderer==="canvas"')
        check(page.locator('.shore-art').evaluate('e=>getComputedStyle(e).visibility')=='visible','A lost graphics context restores the original coastline and animated fallback')
        page.locator('[data-node-id="dengfu"]').click(force=True);settled(page)
        check(page.locator('#detail-content h1').inner_text()=='灯浮市','Server navigation still works after the Three.js context is lost')
        check(all(url.startswith(f'http://127.0.0.1:{server.server_port}/') or url.startswith('data:') for url in requests),'The Three.js experience makes no CDN or other external requests')
        context.close()
        local=browser.new_context(viewport={'width':1100,'height':750},reduced_motion='reduce')
        page=local.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto((ROOT/'index.html').as_uri());ready(page)
        check(page.evaluate('window.coast3D?.active'),'Double-click file mode starts the local Three.js renderer')
        page.locator('[data-node-id="dengta"]').click(force=True);settled(page)
        check(page.locator('#detail-content h1').inner_text()=='灯塔镇','Local file mode keeps working through server navigation')
        local.close()
        unavailable=browser.new_context(viewport={'width':1100,'height':750},reduced_motion='reduce')
        unavailable.route('**/three-r180.js',lambda route:route.abort())
        page=unavailable.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(URL);ready(page)
        fallback=page.evaluate('''()=>!window.coast3D&&!document.body.classList.contains('has-three')&&document.querySelector('#cinema-canvas').getContext('2d').getImageData(0,0,1000,700).data.some((v,i)=>i%4===3&&v>0)''')
        page.locator('[data-node-id="dengta"]').click(force=True);settled(page)
        check(fallback and page.locator('#detail-content h1').inner_text()=='灯塔镇','A missing Three.js library leaves the original coast and server navigation usable')
        unavailable.close();browser.close()
        check(not errors,'No JavaScript or shader errors during Three.js acceptance')
        completed=True
finally:
    server.shutdown()
    (OUTPUT/'three-verification.json').write_text(json.dumps({'status':'passed' if completed else 'failed','checks':checks,'passed':len(checks),'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Completed {len(checks)} Three.js checks.',flush=True)
