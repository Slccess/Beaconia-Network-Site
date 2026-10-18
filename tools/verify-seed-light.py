"""Exercise the seed section handoff and the shared projected light target."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
import json, os, sys
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'preview'
OUTPUT.mkdir(exist_ok=True)
sys.stdout.reconfigure(encoding='utf-8')
checks,errors,light_samples,section_frames=[],[],[],[]
completed=False

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*_):pass

server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
Thread(target=server.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{server.server_port}/index.html'

def check(ok,label):
    if not ok:raise AssertionError(label)
    checks.append(label);print('PASS',label,flush=True)

def ready(page):
    page.wait_for_function('document.querySelector("#boot").hidden&&!document.querySelector("#site-shell").inert',timeout=40000)

def settled(page,view='detail'):
    page.wait_for_function('''v=>document.body.dataset.view===v&&document.body.dataset.route===location.hash&&!document.querySelector('#site-shell').inert&&!document.body.classList.contains('is-fragmenting')''',arg=view,timeout=15000)

def go(page,route):
    page.evaluate('r=>location.hash=r',route);settled(page,'home' if route=='/home' else 'detail')

def section(page):
    page.locator('.seed-invitation').evaluate('e=>e.scrollIntoView({block:"center",behavior:"instant"})')
    page.wait_for_timeout(900)

def clear(page):
    return page.evaluate('''()=>{const c=document.querySelector('#cinema-canvas');return !c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)}''')

def watch_section(page):
    page.evaluate('''()=>{
      window.seedWatch=true;window.seedFrames=[];window.seedScroll=scrollY;
      function frame(){
        if(!window.seedWatch)return;
        const nav=[...document.querySelectorAll('.tide-lines,.sea-navigation,.ring-caption,.back-coast,.return-hint')].map(e=>{const s=getComputedStyle(e);return {x:parseFloat(s.translate)||0,opacity:Number(s.opacity)}});
        const wash=document.querySelector('.detail-wash'),rail=getComputedStyle(wash,'::before');
        const railX=(parseFloat(rail.translate)||0)*(rail.translate.includes('%')?parseFloat(rail.width)/100:1);
        seedFrames.push({view:document.body.dataset.view,scroll:scrollY,phase:document.querySelector('#cinema-canvas').dataset.phase,
          coast:Number(getComputedStyle(document.querySelector('.coast-art')).opacity),wash:Number(getComputedStyle(document.querySelector('.detail-wash')).opacity),
          heroVisible:getComputedStyle(document.querySelector('.hero-copy')).visibility!=='hidden'&&Number(getComputedStyle(document.querySelector('.hero-copy')).opacity)>.001,
          nav,railX});
        requestAnimationFrame(frame);
      }requestAnimationFrame(frame);
    }''')

def check_section_frames(page,label):
    record=page.evaluate('''()=>{window.seedWatch=false;return {viewport:[innerWidth,innerHeight],scroll:seedScroll,frames:seedFrames}}''')
    section_frames.append(record)
    frames=record['frames'];detail=[f for f in frames if f['view']=='detail']
    check(bool(detail) and all(f['coast']==0 and f['wash']==1 and not f['heroVisible'] for f in detail),f'No coast frame or homepage title flashes behind the section handoff at {label}')
    check(all(abs(f['scroll']-record['scroll'])<2 for f in frames if f['view']=='home'),f'The outgoing page stays at its original position at {label}')
    entering=[f for f in detail if f['nav'][0]['x']<-.01]
    check(bool(entering) and min(f['nav'][0]['x'] for f in entering)<-10 and any(0<f['nav'][0]['opacity']<1 for f in entering),f'The navigation visibly eases in from the left at {label}')
    check(all(max(n['x'] for n in f['nav'])-min(n['x'] for n in f['nav'])<.05 and abs(f['railX']-f['nav'][0]['x'])<.05 for f in entering),f'Rail background, waves, nodes and labels enter together at {label}')
    check(page.locator('.sea-navigation').evaluate('e=>{const s=getComputedStyle(e);return (parseFloat(s.translate)||0)===0&&Number(s.opacity)===1}'),f'The navigation finishes in its normal clickable position at {label}')

try:
    logo=Image.open(ROOT/'assets/seed-plan-mark.png')
    check(logo.mode=='RGBA' and logo.getchannel('A').getextrema()==(0,255),'The supplied logo keeps its real alpha channel')
    with sync_playwright() as p:
        executable=os.environ.get('DENGTA_BROWSER') or str(Path(os.environ['LOCALAPPDATA'])/'ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-win64/chrome-headless-shell.exe')
        browser=p.chromium.launch(executable_path=executable,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        context=browser.new_context(viewport={'width':1440,'height':900},reduced_motion='reduce')
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(URL);ready(page)
        # Pick ground, cliff and roof positions in the actual Three.js scene.
        points=page.evaluate('''()=>{
          const c=coast3D,land=c.scene.getObjectByName('Solid coastal headland');c.scene.updateMatrixWorld(true);
          return [[2.5,-.05,2],[1.3,-1.3,2.9],[1.57,.8,-.18]].map(a=>c.projectWorld(land.localToWorld(new THREE.Vector3(...a))));
        }''')
        for i,point in enumerate(points):
            page.mouse.move(point['x'],point['y']);page.wait_for_timeout(100)
            result=page.evaluate('''()=>{
              const c=coast3D,s=c.scene.getObjectByName('Interactive lighthouse beam'),a=s.userData.screenTarget,p=c.projectWorld(s.target.position),stage=document.querySelector('#coast-stage'),ray=new THREE.Raycaster();
              ray.setFromCamera(new THREE.Vector2(a.x/stage.clientWidth*2-1,1-a.y/stage.clientHeight*2),c.camera);
              c.scene.updateMatrixWorld(true);
              const tower=c.scene.getObjectByName('Shared sand and coast lighthouse');
              const solid=ray.intersectObjects([c.scene.getObjectByName('Solid coastal headland'),...tower.children.filter(o=>o.isMesh)],true)[0];
              return {surface:s.userData.surface,screenError:Math.hypot(p.x-a.x,p.y-a.y),overlayError:Math.hypot(p.x-Number(stage.dataset.lightX),p.y-Number(stage.dataset.lightY)),hitError:solid?.point.distanceTo(s.target.position),waterStrength:c.scene.getObjectByName('Displaced 3D sea').material.uniforms.uSpotStrength.value};
            }''')
            light_samples.append(result)
            check(result['surface']=='land' and result['hitError']<.001 and result['screenError']<.01,f'The spotlight hits the visible solid surface beneath cursor {i+1}')
            check(result['overlayError']<.02 and result['waterStrength']==0,f'Solid target {i+1} shares one beam aim and adds no second water pool')
        page.screenshot(path=str(OUTPUT/'light-land-aligned.png'))
        page.emulate_media(reduced_motion='no-preference')
        for x,y in [(1300,680),(1150,760),(600,600),(1320,700)]:
            page.mouse.move(x,y);page.wait_for_timeout(80)
            result=page.evaluate('''()=>{
              const c=coast3D,s=c.scene.getObjectByName('Interactive lighthouse beam'),p=c.projectWorld(s.target.position),stage=document.querySelector('#coast-stage');
              return Math.hypot(p.x-Number(stage.dataset.lightX),p.y-Number(stage.dataset.lightY));
            }''')
            check(result<.1,'Both light layers stay aligned while the pointer and camera move')
        page.locator('[data-node-id="dengzhu"]').hover(force=True);page.wait_for_timeout(900)
        check(page.evaluate('coast3D.scene.getObjectByName("Interactive lighthouse beam").userData.surface')=='water','A sea node still targets the water surface')
        section(page)
        check(page.locator('.seed-invitation .seed-orbits i').count()==3 and page.locator('#home-content img[src="assets/seed-plan-mark.png"]').count()==0,'The homepage retains its original constellation without the plan logo')
        page.screenshot(path=str(OUTPUT/'seed-section-desktop.png'))
        page.evaluate('''()=>{window.seedPhases=[];new MutationObserver(()=>{seedPhases.push(document.querySelector('#cinema-canvas').dataset.phase)}).observe(document.querySelector('#cinema-canvas'),{attributes:true,attributeFilter:['data-phase']});}''')
        watch_section(page)
        before=page.evaluate('scrollY')
        link=page.locator('.seed-invitation .line-link').bounding_box()
        page.mouse.click(link['x']+link['width']/2,link['y']+link['height']/2)
        page.wait_for_function('document.querySelector("#cinema-canvas").dataset.phase==="seed-dissolving"')
        check(page.evaluate('document.body.dataset.view==="home"&&scrollY>1000&&document.querySelector("#site-shell").inert'),'The dark section starts breaking at its original scroll position before routing')
        check(abs(page.evaluate('scrollY')-before)<2,f'Starting the section handoff keeps the scroll position ({before} to {page.evaluate("scrollY")})')
        check(page.locator('.seed-invitation').evaluate('e=>getComputedStyle(e).visibility')=='hidden' and not clear(page),'Triangle pixels replace the original dark section in the same frame')
        page.wait_for_timeout(180);page.screenshot(path=str(OUTPUT/'seed-section-fragments.png'))
        page.wait_for_function('seedPhases.includes("seed-rebuilding")')
        check(page.locator('.seed-page').count()==1 and page.locator('.seed-slot-page').count()==0,'Section fragments enter the general Seed Plan introduction')
        page.screenshot(path=str(OUTPUT/'seed-logo-rebuilding.png'))
        settled(page)
        check_section_frames(page,'1440x900')
        check('Beaconia Network / Seed Plan' in page.locator('.seed-page .detail-topline').inner_text() and 'SEED PROGRAM' not in page.locator('#detail-content').inner_text(),'The plan introduction uses the Seed Plan name')
        check(page.evaluate('document.body.dataset.world==="seed-plan"&&getComputedStyle(document.querySelector(".seed-detail-hero h1")).color==="rgb(21, 94, 43)"'),'The plan heading retains the logo-inspired forest green')
        check(page.locator('.sea-node .node-label b').first.evaluate('e=>getComputedStyle(e).color')=='rgb(47, 81, 64)' and page.evaluate('getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()')=='rgb(195, 211, 180)','The plan navigation uses soft sage with dark readable labels')
        check(clear(page),'The section handoff leaves no opaque tiles over the transparent logo')
        check(page.locator('.seed-logo').evaluate('e=>e.complete&&e.naturalWidth>0&&getComputedStyle(e).opacity==="1"'),'The final logo is decoded and fully visible')
        page.screenshot(path=str(OUTPUT/'seed-detail-desktop.png'))
        check(page.locator('.seed-file').count()==5,'The plan introduction files the document in five sections')
        check(page.locator('.seed-file[open]').count()==1 and page.locator('.seed-file').first.get_attribute('open') is not None,'The first plan section opens by default')
        page.locator('.seed-file').nth(2).locator('summary').click()
        check(page.locator('.seed-file[open]').count()==2 and page.locator('.seed-file').first.get_attribute('open') is not None and page.locator('.seed-file').nth(2).get_attribute('open') is not None,'Opening another plan section keeps the earlier one open')
        plan_text=page.locator('#detail-content').text_content()
        check(all(part in plan_text for part in ['服务器生态共建者招募计划','重要适用范围说明','常驻白名单的认定标准','灯塔西弥斯审核组','期待与你同行','对于以下部分，请点按对应部分标题查看详情','本页呈现内容与PDF下载内容一致','种子计划报名咨询人','2918407812','我们已经援助过5家服务器','为帮助其他服主，部分服务器官网已于我站展示并帮助宣传','我们主动肩负起更广泛的生态责任，彰显灯塔担当']),'The approved Seed Plan copy is present in full')
        check(page.locator('.seed-partners-count b').inner_text()=='5' and page.locator('.seed-partners-count b').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)>parseFloat(getComputedStyle(e.parentElement).fontSize)'),'The aided-server count is visually emphasized')
        check(page.locator('.seed-scope-grid article').count()==2 and 'BE' in page.locator('.seed-scope-grid').inner_text() and 'JE' in page.locator('.seed-scope-grid').inner_text(),'The base and Java scope notes are both shown')
        check(page.locator('.seed-download a').get_attribute('href')=='assets/seed-plan-proposal.pdf' and page.evaluate('async()=>{const r=await fetch("assets/seed-plan-proposal.pdf",{method:"HEAD"});return r.ok&&r.headers.get("content-type")==="application/pdf"}'),'The original proposal PDF is offered for download')
        copy_button=page.locator('.seed-contact .contact-copy')
        copy_button.click()
        page.wait_for_timeout(200)
        check(copy_button.get_attribute('data-copy')=='2918407812' and copy_button.locator('.copy-action').inner_text() in ('已复制','重试'),'The consultation number has a one-tap copy control')
        go(page,'/home')
        page.locator('[data-node-id="slot-2"]').click(force=True)
        page.wait_for_timeout(350)
        check(page.locator('#detail-shell').is_hidden() and page.evaluate('document.body.dataset.view')=='home','A pending seed node keeps its label but no longer navigates')
        go(page,'/seed/slot-2')
        check(page.locator('.seed-slot-page').count()==1 and '席位 02' in page.locator('#detail-content').inner_text() and page.locator('.seed-logo').count()==0,'A pending slot still opens by direct route, separate from the general introduction')
        page.locator('.seed-slot-page .line-link').click();settled(page)
        check(page.locator('.seed-logo').count()==1 and clear(page),'A server slot can open the general plan through its own link')
        go(page,'/world/dengta');check(clear(page),'A transparent logo switches cleanly into a server flag')
        go(page,'/seed');check(clear(page),'A server flag switches cleanly into a transparent logo')
        for action in ['resize','reduce','supersede']:
            go(page,'/home');section(page);page.locator('.seed-invitation .line-link').click()
            page.wait_for_function('document.querySelector("#cinema-canvas").dataset.phase==="seed-dissolving"')
            if action=='resize':page.set_viewport_size({'width':1366,'height':768})
            elif action=='reduce':page.emulate_media(reduced_motion='reduce')
            else:page.evaluate('location.hash="/world/dengfu"')
            settled(page)
            check(clear(page) and not page.evaluate('document.body.classList.contains("is-seed-departing")'),f'Interrupted section transfer cleans up after {action}')
            check(page.locator('.world-page' if action=='supersede' else '.seed-page').count()==1,f'Interrupted section transfer commits the correct page after {action}')
            page.emulate_media(reduced_motion='no-preference')
        for w,h in [(1920,1080),(1024,768),(768,1024),(390,844),(320,568),(844,390)]:
            page.set_viewport_size({'width':w,'height':h});go(page,'/home');section(page)
            if w==390:page.screenshot(path=str(OUTPUT/'seed-section-mobile.png'))
            watch_section(page)
            link=page.locator('.seed-invitation .line-link').bounding_box()
            page.mouse.click(link['x']+link['width']/2,link['y']+link['height']/2);settled(page)
            check_section_frames(page,f'{w}x{h}')
            check(page.evaluate('''()=>{const e=document.querySelector('.seed-logo'),r=e.getBoundingClientRect(),s=document.querySelector('#detail-shell');return r.left>=s.getBoundingClientRect().left&&r.right<=innerWidth&&s.scrollWidth<=s.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1}'''),f'Seed logo and content fit {w}x{h}')
            check(clear(page),f'Section fragments clear at {w}x{h}')
            if w==390:page.screenshot(path=str(OUTPUT/'seed-detail-mobile.png'))
        page.emulate_media(reduced_motion='reduce');go(page,'/home');section(page)
        page.locator('.seed-invitation .line-link').click();settled(page)
        check(clear(page),'Reduced motion opens the plan immediately without fragment debris')
        page.goto((ROOT/'index.html').as_uri()+'#/seed');ready(page)
        check(page.locator('.seed-logo').evaluate('e=>e.complete&&e.naturalWidth>0'),'The transparent logo works when the site is opened as a local file')
        go(page,'/home');page.emulate_media(reduced_motion='no-preference');section(page)
        page.locator('.seed-invitation .line-link').click();settled(page)
        check(clear(page) and page.locator('.seed-logo').count()==1,'Local file mode completes the dark section fragments and clears their bitmap')
        go(page,'/home')
        page.evaluate('coast3D.renderer.getContext().getExtension("WEBGL_lose_context").loseContext()')
        page.wait_for_function('!coast3D.active');section(page)
        page.locator('.seed-invitation .line-link').click();settled(page)
        check(clear(page) and page.locator('.seed-page').count()==1,'The dark section handoff remains usable after losing the 3D context')
        context.close()
        # Supplied partner data continues to use individual routes and flags.
        context=browser.new_context(viewport={'width':1100,'height':800},reduced_motion='reduce')
        script=(ROOT/'data.js').read_text(encoding='utf-8')+'\nwindow.SITE_DATA.partners=[{id:"example",name:"合作测试服",description:"独立服务器资料",flag:"assets/dengfu-city.webp"}];'
        context.route('**/data.js',lambda route:route.fulfill(body=script,content_type='application/javascript'))
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(URL);ready(page)
        page.locator('[data-node-id="example"]').click(force=True);settled(page)
        check(page.locator('.partner-page h1').inner_text()=='合作测试服' and page.locator('.partner-flag').count()==1 and page.locator('.seed-page').count()==0,'A configured outer node opens its independent server profile and flag')
        check(page.evaluate('coastCinema.capture().image?.className')=='partner-flag','Partner flag artwork remains the fragment source')
        browser.close();check(not errors,'No runtime errors in seed and light acceptance');completed=True
finally:
    server.shutdown()
    (OUTPUT/'seed-light-verification.json').write_text(json.dumps({'status':'passed' if completed else 'failed','passed':len(checks),'checks':checks,'errors':errors,'light_samples':light_samples,'section_frames':section_frames},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Completed {len(checks)} seed and light checks.',flush=True)
