"""Coastal site interaction and visual acceptance checks. Run: python tools/verify.py"""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
import json
import os
import sys
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'preview'
OUTPUT.mkdir(exist_ok=True)
checks, errors = [], []
completed = False
sys.stdout.reconfigure(encoding='utf-8')

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
    page.wait_for_function('!document.querySelector("#site-shell").inert', timeout=6000)

def settled(page, mode='detail'):
    page.wait_for_function('(mode)=>document.body.dataset.view===mode', arg=mode)
    page.wait_for_function('(mode)=>document.body.dataset.route===location.hash&&document.querySelector("#coast-stage").dataset.progress===(mode==="home"?"0.000":"1.000")&&!document.body.classList.contains("is-fragmenting")&&!document.querySelector("#site-shell").inert', arg=mode, timeout=7000)
    page.wait_for_timeout(100)

def navigate(page, hash_value):
    page.evaluate('(hash)=>location.hash=hash', hash_value)
    settled(page, 'home' if hash_value in ['/home','/overview','/organization','/worlds'] else 'detail')

def click_node(page, ident):
    # Nodes breathe with the water; click their actual, current screen position.
    rect = page.locator(f'[data-node-id="{ident}"]').bounding_box()
    page.mouse.click(rect['x']+22, rect['y']+22)

def overflow(page):
    return page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')

def snap(page, name):
    page.screenshot(path=str(OUTPUT / name))

def touch(cdp, kind, points):
    cdp.send('Input.dispatchTouchEvent', {'type':kind, 'touchPoints':[{'x':x,'y':y,'id':i} for i,(x,y) in enumerate(points)]})

try:
    with sync_playwright() as p:
        executable = os.environ.get('DENGTA_BROWSER')
        cached = Path(os.environ.get('LOCALAPPDATA','')) / 'ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-win64/chrome-headless-shell.exe'
        if not executable and cached.exists(): executable=str(cached)
        browser=p.chromium.launch(executable_path=executable,headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        context=browser.new_context(viewport={'width':1440,'height':900},device_scale_factor=1)
        page=context.new_page()
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(URL,wait_until='domcontentloaded')
        check(page.locator('#boot').is_visible(),'First visit shows the coastal prologue')
        check(page.locator('#site-shell').evaluate('(e)=>e.inert'),'Loading isolates background controls')
        check(page.locator('#boot .boot-title').inner_text()=='凝沙化塔' and page.locator('#boot .boot-count, #boot .boot-edition').count()==0,'Prologue has only the requested visible title')
        assembly=page.wait_for_function('''()=>{const c=document.querySelector('#cinema-canvas'),p=+c.dataset.progress;return c.dataset.phase==='assembling'&&p>.05&&p<.95?p:null}''',timeout=7000).json_value()
        check(0<assembly<1,'Sand visibly assembles the three-dimensional lighthouse')
        snap(page,'coast-loading.png')
        page.wait_for_function('document.querySelector("#cinema-canvas").dataset.phase==="assembled"',timeout=15000)
        snap(page,'coast-loading-complete.png')
        page.wait_for_function('document.querySelector("#cinema-canvas").dataset.phase==="landing"',timeout=3000)
        page.wait_for_timeout(550)
        check(page.locator('#site-shell').evaluate('(e)=>e.inert'),'Intact lighthouse arrival keeps controls locked until the coast is built')
        snap(page,'coast-loading-transfer.png')
        ready(page)
        check(page.locator('.boot-meter').get_attribute('aria-valuenow')=='100','Loading progress reflects completed resources')
        check(page.evaluate('Array.from(document.images).filter(i=>!i.loading||i.loading!=="lazy").every(i=>i.complete&&i.naturalWidth>0)'),'Coastal artwork and managed images decode')
        check(page.locator('#inner-nodes .sea-node').count()==4,'Inner wave has four core worlds')
        check(page.locator('#outer-nodes .sea-node').count()==4,'Empty partner data has four explicitly pending seed places')
        check(page.locator('.tide-lines [data-wave]').count()==2,'Two continuous tidal navigation paths')
        check(page.locator('.site-header').count()==0,'No traditional header navigation')
        check(not overflow(page),'Desktop has no horizontal overflow')
        check(page.evaluate('window.coast3D?.active&&window.coast3D.renderer.isWebGLRenderer&&window.coast3D.scene.getObjectByName("Displaced 3D sea").isMesh'),'Coast and animated ocean use the local Three.js renderer')
        snap(page,'coast-desktop.png')
        page.evaluate('window.savedNavigation=document.querySelector("#inner-nodes")')
        for ident, accent in [('dengta','#9bc9fe'),('dengzhu','#ffab70'),('dengfu','#99bf9b'),('denghuo','#f5df94'),('slot-1','#a8c7b4')]:
            page.locator(f'[data-node-id="{ident}"]').hover(force=True)
            page.wait_for_timeout(850)
            state=page.locator('#coast-stage').evaluate('(e)=>({...e.dataset})')
            check(state['lightTarget']==ident and state['lightColor']==accent and page.evaluate('document.body.dataset.view')=='home',f'Hover aims theme light at {ident} without navigation')
            if ident in ['dengta','dengzhu']:
                rgba=page.evaluate('''id=>{const r=document.querySelector('[data-node-id="'+id+'"]').getBoundingClientRect();return [...document.querySelector('#sea-canvas').getContext('2d').getImageData(Math.round(r.x+22),Math.round(r.y+22),1,1).data]}''',ident)
                check(rgba[2]>rgba[0]+30 if ident=='dengta' else rgba[0]>rgba[2]+50, f'{ident} spotlight pixels visibly carry the server color')
            if ident=='dengzhu': snap(page,'coast-hover-orange.png')
        near_node=page.locator('[data-node-id="dengta"]').bounding_box()
        page.mouse.move(near_node['x']+22+52,near_node['y']+22)
        page.wait_for_timeout(450)
        check(page.locator('#coast-stage').get_attribute('data-light-target')=='dengta','Light gently snaps to a nearby server node')
        # Keep this point between the two rings so it is unambiguously open sea
        # after the nearby-node attraction range is enabled.
        page.mouse.move(500,600)
        page.wait_for_timeout(650)
        check(page.locator('#coast-stage').get_attribute('data-light-mode')=='sea','Ordinary sea hover follows pointer with broad light')
        snap(page,'coast-sea-light.png')
        bird=page.locator('.goose').first
        bird.hover(force=True)
        check(bird.evaluate('(e)=>e.classList.contains("is-flapping")'),'Goose flaps on hover')
        check(bird.evaluate('(e)=>getComputedStyle(e.querySelector(".wing-left")).animationDirection===getComputedStyle(e.querySelector(".wing-right")).animationDirection'),'Both goose wings flap synchronously')
        page.wait_for_timeout(850)
        check(not bird.evaluate('(e)=>e.classList.contains("is-flapping")'),'Goose returns to gliding after one wingbeat')
        click_node(page,'dengta')
        state=page.wait_for_function('''()=>{const p=+document.querySelector('#coast-stage').dataset.progress,c=document.querySelector('#cinema-canvas');return p>.01&&p<.99?{progress:p,phase:c.dataset.phase,fragments:+c.dataset.fragments,opacity:parseFloat(getComputedStyle(document.querySelector('.detail-wash')).opacity)}:null}''',timeout=4000).json_value()
        progress=state['progress']
        check(0<progress<1,'Wave-to-rail transition has real intermediate geometry')
        check(state['phase']=='flag-fragments' and state['fragments']>200,'The lighthouse breaks into triangles on the way to the flag')
        opacity=state['opacity']
        check(abs(opacity-progress)<.05,'Background dissolve follows the same progress as the tide geometry')
        snap(page,'coast-transition.png')
        settled(page)
        check(page.locator('.flag-cloth img').is_visible() and not page.locator('#site-shell').evaluate('(e)=>e.inert'),'Reconstructed flag reveals and controls unlock at the end of the transfer')
        check(page.evaluate('!document.querySelector("#cinema-canvas").getContext("2d").getImageData(0,0,innerWidth-20,innerHeight).data.some((v,i)=>i%4===3&&v>0)'),'Archive has no leftover triangle canvas over the real flag')
        check(page.locator('#detail-content h1').inner_text()=='灯塔镇','Click opens the selected world')
        positions=page.locator('#inner-nodes').evaluate('(e)=>[...e.children].map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y}))')
        check(positions[1]['x']>positions[0]['x'],'Detail navigation curves convexly to the right')
        for ident,name,accent in [('dengta','灯塔镇','#9bc9fe'),('dengzhu','灯筑城','#ffab70'),('dengfu','灯浮市','#99bf9b'),('denghuo','灯火乡','#f5df94')]:
            if ident!='dengta':
                before=page.evaluate('getComputedStyle(document.documentElement).getPropertyValue("--accent")')
                click_node(page,ident)
                if ident=='dengzhu':
                    outgoing=page.wait_for_function('''()=>{const c=document.querySelector('#cinema-canvas');return c.dataset.phase==='flag-dissolving'&&+c.dataset.progress>.07?{name:document.querySelector('#detail-content h1').innerText,node:document.querySelector('.sea-node[aria-current]').dataset.nodeId,accent:document.documentElement.style.getPropertyValue('--accent')}:null}''',timeout=4000).json_value()
                    check(outgoing=={'name':'灯塔镇','node':'dengta','accent':'#9bc9fe'},'Old page and selected navigation stay in place while its flag dissolves')
                    # Observe a real color-transition frame; software rendering can defer its first tick past 42%.
                    incoming=page.wait_for_function('''before=>{const c=document.querySelector('#cinema-canvas'),root=document.documentElement,middle=getComputedStyle(root).getPropertyValue('--accent');const blending=root.getAnimations().some(a=>a.transitionProperty==='--accent'&&a.playState==='running');return c.dataset.phase==='flag-rebuilding'&&+c.dataset.progress>.42&&blending&&middle!==before?{name:document.querySelector('#detail-content h1').innerText,node:document.querySelector('.sea-node[aria-current]').dataset.nodeId,accent:root.style.getPropertyValue('--accent'),middle}:null}''',arg=before,timeout=4000).json_value()
                    check(incoming['name']=='灯筑城' and incoming['node']=='dengzhu' and incoming['accent']=='#ffab70','New page and selected navigation change together before the flag rebuilds')
                    middle=incoming['middle']
                settled(page)
                if ident=='dengzhu':
                    after=page.evaluate('getComputedStyle(document.documentElement).getPropertyValue("--accent")')
                    check(middle!=before and middle!=after,'World palette transitions through intermediate colors')
            check(page.locator('#detail-content h1').inner_text()==name,f'{name} opens its own archive')
            check(page.evaluate('document.documentElement.style.getPropertyValue("--accent")')==accent,f'{name} applies its flag palette')
            check(page.evaluate('document.querySelector("#inner-nodes")===window.savedNavigation'),'World switch preserves navigation DOM')
            check(page.locator(f'[data-node-id="{ident}"] .node-label small').is_visible(),f'{name} keeps its server type in the detail navigation')
            enlarged=page.locator(f'[data-node-id="{ident}"]').evaluate('''node=>['.node-label b','.node-point'].every(selector=>{const e=node.querySelector(selector);return e.getBoundingClientRect().width>e.offsetWidth*1.08;})''')
            check(enlarged,f'{name} selected name and node visibly enlarge')
            now=page.locator('#inner-nodes').evaluate('(e)=>[...e.children].map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y}))')
            check(all(abs(a['x']-b['x'])<.1 and abs(a['y']-b['y'])<.1 for a,b in zip(now,positions)),'World switch keeps the left nodes in place')
            snap(page,f'coast-{ident}.png')
        check(page.locator('#detail-content [role="tab"]').all_text_contents()==['服务器介绍','领导成员'],'World archive exposes only introduction and leadership')
        page.locator('#detail-content [data-tab="intro"]').press('ArrowRight')
        check(page.locator('#detail-content [data-tab="leaders"]').get_attribute('aria-selected')=='true','Keyboard switches archive tabs')
        check(page.locator('.leader-role').all_text_contents()==['服主','书记'] and page.locator('.leader-entry h3').all_text_contents()==['暂未选举','暂未选举'],'Bearcade leadership accurately reports both roles awaiting election')
        page.mouse.click(700,300,button='right')
        progress=page.wait_for_function('''()=>{const p=+document.querySelector('#coast-stage').dataset.progress;return p>.01&&p<.99?p:null}''',timeout=4000).json_value()
        check(0<progress<1,'Right click starts smooth reverse transition')
        settled(page,'home')
        check(page.locator('#detail-shell').is_hidden(),'Right click returns to the coast')
        page.go_back(); settled(page)
        check(page.locator('#detail-content h1').inner_text()=='灯火乡','Browser back restores selected world')
        page.go_forward(); settled(page,'home')
        click_node(page,'slot-2')
        page.wait_for_timeout(300)
        check(page.locator('#detail-shell').is_hidden() and page.evaluate('document.body.dataset.view')=='home' and page.evaluate('location.hash') in ('#/home',''),'A pending seed node stays on the coast without navigating')
        navigate(page,'/seed/slot-2')
        check('此席位的合作服务器尚未公布' in page.locator('#detail-content').inner_text() and page.locator('.seed-slot-page').count()==1,'The unpublished slot page remains available by direct link')
        page.keyboard.press('Escape'); settled(page,'home')
        check(page.locator('#detail-shell').is_hidden(),'Escape provides an accessible return')
        page.evaluate("location.hash='/world/dengta';setTimeout(()=>location.hash='/world/dengzhu',25);setTimeout(()=>location.hash='/world/dengfu',50);setTimeout(()=>location.hash='/world/denghuo',75)")
        settled(page)
        check(page.locator('#detail-content h1').inner_text()=='灯火乡','Rapid routes settle on the final destination')
        navigate(page,'/home')
        page.locator('[data-scroll="system-overview"]').click()
        page.wait_for_timeout(1200)
        check(page.evaluate('scrollY>600'),'Scroll invitation reaches system overview')
        check(page.locator('.epigraph-text').inner_text()=='此心安处是吾乡' and page.locator('.humanity-prose p').count()==5,'Scroll reaches the epigraph and complete five-paragraph introduction')
        page.locator('.organization-row summary').nth(1).click()
        check('公益心理咨询服务' in page.locator('.organization-row[open]').inner_text(),'Organization rows expand to the supplied complete institution text')
        check(page.locator('.org-name').all_text_contents()==['灯塔服系布帆委员会','锡安委员会','灯塔镇文化艺术筹划组','新服联外务委员会'],'One group and three committees keep their current official names')
        for y in range(0,page.evaluate('document.documentElement.scrollHeight'),600):
            page.evaluate('(y)=>scrollTo({top:y,behavior:"instant"})',y);page.wait_for_timeout(70)
        page.evaluate('scrollTo({top:0,behavior:"instant"})');page.wait_for_timeout(500)
        page.screenshot(path=str(OUTPUT/'coast-full-page.png'),full_page=True)
        page.reload();page.wait_for_timeout(200)
        check(page.locator('#boot').is_hidden(),'Repeat visits skip the prologue')
        ready(page)
        page.locator('#replay-boot').click()
        check(page.locator('#boot').is_visible(),'Footer replays the coastal prologue')
        page.locator('#boot-skip').click();ready(page)
        navigate(page,'/community')
        check(page.locator('#detail-content button:disabled').count()==1 and page.locator('.footer-destinations .footer-disabled').count()==1 and page.locator('.footer-destinations a[href="#/community"]').count()==0,'Unset forum remains explicitly unavailable')
        navigate(page,'/world/not-a-world')
        check('暂未点亮' in page.locator('#detail-content h1').inner_text(),'Unknown route has a returnable missing page')
        navigate(page,'/home')
        for width,height in [(1920,1080),(1366,768),(768,1024),(844,390)]:
            page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(250)
            check(not overflow(page),f'Home fits {width}x{height}')
            navigate(page,'/world/dengta')
            check(not overflow(page),f'World archive fits {width}x{height}')
            navigate(page,'/home')
        mobile_context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
        mobile=mobile_context.new_page();mobile.on('pageerror',lambda e:errors.append(str(e)))
        mobile.goto(URL);ready(mobile);snap(mobile,'coast-mobile.png')
        check('coast-mobile' in mobile.locator('#coast-art').evaluate('(e)=>e.currentSrc'),'Mobile uses an individually composed vector coastline')
        check(not overflow(mobile),'Mobile coast has no horizontal overflow')
        mobile.locator('[data-node-id="dengta"]').tap(force=True);settled(mobile)
        snap(mobile,'coast-mobile-world.png')
        check(not overflow(mobile),'Mobile world archive has no horizontal overflow')
        check(mobile.locator('#inner-nodes .node-label small:visible').count()==4,'Mobile detail navigation preserves all four server types')
        cdp=mobile_context.new_cdp_session(mobile)
        touch(cdp,'touchStart',[(280,650)])
        for y in [620,570,510,450,390]:
            touch(cdp,'touchMove',[(280,y)]);mobile.wait_for_timeout(40)
        touch(cdp,'touchEnd',[]);mobile.wait_for_timeout(850)
        check(mobile.evaluate('document.body.dataset.view')=='detail','Swiping content cancels return gesture')
        check(mobile.locator('#detail-shell').evaluate('(e)=>e.scrollTop')>0,'Mobile archive scrolls naturally')
        touch(cdp,'touchStart',[(350,220)]);mobile.wait_for_timeout(800);touch(cdp,'touchEnd',[]);settled(mobile,'home')
        check(mobile.locator('#detail-shell').is_hidden(),'Real touch long press returns to the coast')
        mobile.set_viewport_size({'width':320,'height':667});mobile.wait_for_timeout(300)
        check(not overflow(mobile),'Coast fits a 320-pixel phone')
        navigate(mobile,'/world/dengzhu')
        check(not overflow(mobile),'Double rail and archive fit a 320-pixel phone')
        snap(mobile,'coast-small-phone.png')
        reduced=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
        static=reduced.new_page();static.on('pageerror',lambda e:errors.append(str(e)))
        static.goto(URL+'#/world/dengfu');ready(static)
        check(static.locator('#coast-stage').get_attribute('data-progress')=='1.000','Reduced motion opens directly at final geometry')
        before=static.locator('[data-wave="inner"] .wave-line').get_attribute('d');static.wait_for_timeout(250)
        check(static.locator('[data-wave="inner"] .wave-line').get_attribute('d')==before,'Reduced motion stops continuous tide animation')
        static.keyboard.press('Escape');static.wait_for_timeout(100)
        check(static.locator('#coast-stage').get_attribute('data-progress')=='0.000','Reduced motion return is immediate')
        # Test real partner configuration and future goose notes in an isolated context.
        fixture=browser.new_context(viewport={'width':1440,'height':900},reduced_motion='reduce')
        script=(ROOT/'data.js').read_text(encoding='utf-8')+'''\nSITE_DATA.partners=Array.from({length:7},(_,i)=>({id:'test-'+i,name:'测试世界 '+i,description:'测试简介 <b>保持纯文本</b>',color:'#ba9bd4',ink:'#614275',tint:'#f7f0fc',url:i===6?'https://example.org':'javascript:alert(1)'}));SITE_DATA.skyNotes=[{title:'测试奖项',text:'仅供验收的一句话说明。'}];SITE_DATA.forumUrl='https://example.org/forum';'''
        fixture.route('**/data.js',lambda route:route.fulfill(status=200,content_type='text/javascript',body=script))
        test=fixture.new_page();test.on('pageerror',lambda e:errors.append(str(e)))
        test.goto(URL);ready(test)
        test.locator('.goose').first.hover(force=True)
        check(test.locator('.bird-note').first.is_visible(),'Configured goose note appears on hover')
        test.locator('.goose').first.click(force=True)
        test.mouse.move(20,20)
        check(test.locator('.bird-note').first.is_visible(),'Click pins the configured one-line note')
        test.locator('.goose').first.press('Escape')
        check(test.locator('.bird-note').first.is_hidden(),'Escape dismisses the goose note')
        check(test.locator('#seed-pager').is_visible(),'Larger partner lists get outer-ring pagination')
        test.locator('[data-seed-page="1"]').click()
        check(test.locator('#outer-nodes .sea-node:visible').count()==3,'Next seed group exposes remaining partner nodes')
        click_node(test,'test-6');test.wait_for_timeout(100)
        check(test.locator('#detail-content h1').inner_text()=='测试世界 6','Real partner nodes open their own detail route')
        check(test.locator('#detail-content b').count()==0 and '<b>' in test.locator('.partner-description').inner_text(),'Configured copy remains plain text')
        check(test.locator('#detail-content a[target="_blank"]').get_attribute('rel')=='noopener noreferrer','Partner website uses a safe external link')
        check(test.evaluate('document.documentElement.style.getPropertyValue("--accent")')=='#ba9bd4','Partner theme colors the rail and archive')
        navigate(test,'/partner/test-0')
        check(test.locator('#detail-content a[target="_blank"]').count()==0,'Unsafe partner URL is not activated')
        navigate(test,'/community')
        check(test.locator('#detail-content a[target="_blank"]').get_attribute('href')=='https://example.org/forum' and test.locator('.footer-destinations a[href="#/community"]').count()==1,'Configured forum URL becomes available')
        failed=browser.new_context(reduced_motion='reduce')
        failed.route('**/*.webp',lambda route:route.abort())
        failure=failed.new_page();failure.goto(URL);ready(failure)
        check('部分图像暂不可用' in failure.locator('#boot-status').inner_text(),'Failed assets complete loading with an honest fallback')
        local=browser.new_page(viewport={'width':1280,'height':800},reduced_motion='reduce')
        local.on('pageerror',lambda e:errors.append(str(e)))
        local.goto((ROOT/'index.html').as_uri()+'#/world/dengta');ready(local)
        check(local.locator('#detail-content h1').inner_text()=='灯塔镇' and local.locator('.flag-cloth img').evaluate('(e)=>e.naturalWidth>0'),'Double-click file mode supports deep routes and local assets')
        check(not errors,'No JavaScript runtime errors during acceptance')
        completed=True
        browser.close()
finally:
    server.shutdown()
    (OUTPUT/'verification.json').write_text(json.dumps({'status':'passed' if completed else 'failed','checks':checks,'passed':len(checks),'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Completed {len(checks)} checks.',flush=True)
