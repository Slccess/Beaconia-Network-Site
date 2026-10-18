"""Acceptance checks for the supplied institution and server content."""
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
import json
import os
import re
import sys
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'preview'
OUTPUT.mkdir(exist_ok=True)
sys.stdout.reconfigure(encoding='utf-8')
checks, errors, layouts = [], [], []
completed = False


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{server.server_port}/index.html'
source = (ROOT / 'CONTENT_PHASE2_COPY.md').read_text(encoding='utf-8')


def section(text, heading, level=2):
    body = text.split('\n' + '#' * level + ' ' + heading + '\n', 1)[1]
    return re.split(r'\n#{1,' + str(level) + r'} ', body, maxsplit=1)[0].strip()


def check(value, label):
    if not value:
        raise AssertionError(label)
    checks.append(label)
    print('PASS', label, flush=True)


def ready(page):
    page.wait_for_selector('#boot[hidden]', state='attached', timeout=30000)
    page.wait_for_function('!document.querySelector("#site-shell").inert')


def route(page, destination):
    page.evaluate('(destination)=>location.hash=destination', destination)
    page.wait_for_function("document.body.dataset.route===location.hash&&!document.querySelector('#site-shell').inert&&!document.body.classList.contains('is-fragmenting')")


def snap(page, name):
    # Palette interpolation can outlast an instant reduced-motion route.
    page.wait_for_function("document.documentElement.getAnimations().every(animation=>animation.playState!=='running')")
    page.screenshot(path=str(OUTPUT / name))


def boxes_fit(page):
    return page.evaluate('''()=>{
      const shell=document.querySelector('#detail-shell'),r=shell.getBoundingClientRect();
      const selectors='.world-title h1,.world-english,.world-invitation,.world-contact,.archive-prose p,.leader-entry h3,.leader-handle,.member-contact,[role="tab"]';
      const outside=[...shell.querySelectorAll(selectors)].filter(e=>{const b=e.getBoundingClientRect();return b.width&&(b.left<r.left-1||b.right>r.right+1||e.scrollWidth>e.clientWidth+1);}).map(e=>e.className||e.tagName);
      return {outside,shellOverflow:shell.scrollWidth>shell.clientWidth+1,documentOverflow:document.documentElement.scrollWidth>innerWidth+1};
    }''')


try:
    with sync_playwright() as p:
        cached = Path(os.environ.get('LOCALAPPDATA', '')) / 'ms-playwright/chromium_headless_shell-1200/chrome-headless-shell-win64/chrome-headless-shell.exe'
        executable = os.environ.get('DENGTA_BROWSER') or (str(cached) if cached.exists() else None)
        browser = p.chromium.launch(executable_path=executable, headless=True, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, reduced_motion='reduce', permissions=['clipboard-read', 'clipboard-write'])
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(URL)
        ready(page)

        check(page.locator('#organization-title').get_attribute('aria-label') == '同心守望', 'Second chapter has the selected title')
        check(page.locator('.keepers-heading .humanity-side-label').text_content() == '灯塔服系联合领导团“一组三会”介绍', 'Full subtitle is preserved')
        check(page.locator('.organization-row[open]').count() == 1, 'One complete institution is open on arrival')
        names = ['灯塔服系布帆委员会', '锡安委员会', '灯塔镇文化艺术筹划组', '新服联外务委员会']
        org_source = section(source, '首页第二部分')
        for index, name in enumerate(names):
            row = page.locator('.organization-row').nth(index)
            if not row.evaluate('(e)=>e.open'):
                row.locator('summary').press('Enter')
            check(row.evaluate('(e)=>e.open') and page.locator('.organization-row[open]').count() == 1, f'{name}: keyboard opens the institution and closes the previous one')
            check(row.locator('.organization-prose p').all_text_contents() == section(org_source, name, 3).split('\n\n'), f'{name}: every supplied paragraph appears unchanged')
        check('成员名单待公布' not in page.locator('#organizations').text_content(), 'Institution chapter has no obsolete member placeholders')

        expected = [
            ('dengta', '灯塔镇', 'Beacon Town', '友谊、热爱与初心', '生存', '811099008'),
            ('dengzhu', '灯筑城', 'Beacreative', '行思兼具，意匠造物', '创造', '733438517'),
            ('dengfu', '灯浮市', 'Beatorini', '孤岛而不孤独', '空岛', '837447730'),
            ('denghuo', '灯火乡', 'Bearcade', '身体力行，造就良匠', '游戏', '待定'),
        ]
        people = {
            'dengzhu': [('星尘', 'XinohalaYuki', '3365505496'), ('一梦清音', 'xuelian1231', '2918407812')],
            'dengfu': [('INTZOT', 'INTZOT333', '3584578204'), ('Mark250000', 'Mark250000', '2169204459')],
        }
        for ident, name, english, tagline, word, group in expected:
            route(page, '/world/' + ident)
            check(page.locator('.world-english').inner_text() == english and page.locator('.world-invitation').inner_text() == tagline and page.locator('.world-watermark').inner_text() == word, f'{name}: official name, motto and watermark')
            check(page.locator('.archive-tabs button').all_text_contents() == ['服务器介绍', '领导成员'], f'{name}: only the requested two tabs')
            check(page.locator('.archive-prose p').all_text_contents() == section(section(source, name), '服务器介绍', 3).split('\n\n'), f'{name}: full introduction matches the approved source')
            visible = page.locator('.world-page').inner_text()
            check(not re.search(r'THE FLAG|WORLD ARCHIVE|WORLD \d|世界\s*0[1-4]|[蓝橙绿金]\s*/\s*白|领导班子', visible), f'{name}: obsolete annotations removed')
            check(page.locator('.world-contact > strong').inner_text() == group, f'{name}: correct group number or pending state')
            if group != '待定':
                page.locator('.world-contact [data-copy]').click()
                page.wait_for_function("document.querySelector('.world-contact .copy-action').textContent==='已复制'")
                check(page.evaluate('navigator.clipboard.readText()') == group, f'{name}: group number copies to the real clipboard')
            else:
                check(page.locator('.world-contact [data-copy]').count() == 0, 'Pending group number has no bogus copy action')
            snap(page, f'content-{ident}-1440.png')
            page.locator('[data-tab="intro"]').press('ArrowRight')
            check(page.locator('[data-tab="leaders"]').get_attribute('aria-selected') == 'true', f'{name}: keyboard selects leadership')
            if ident == 'dengta':
                check(page.locator('.leadership-note').inner_text() == '灯塔镇纯净生存服由一组三会直属领导，不设立单独的服主与书记。' and page.locator('.leader-entry').count() == 0, 'Beacon Town correctly has direct collective leadership without invented offices')
            elif ident == 'denghuo':
                check(page.locator('.leader-role').all_text_contents() == ['服主', '书记'] and page.locator('.leader-entry h3').all_text_contents() == ['暂未选举', '暂未选举'], 'Bearcade reports both elections pending')
            else:
                for index, (person, handle, contact) in enumerate(people[ident]):
                    card = page.locator('.leader-entry').nth(index)
                    check(card.locator('h3').inner_text() == person and card.locator('.leader-handle').inner_text() == f'（{handle}）' and card.locator('.member-contact > strong').inner_text() == contact, f'{person}: name, account and contact match')
                    card.locator('[data-copy]').click()
                    page.wait_for_function('(value)=>navigator.clipboard.readText().then(text=>text===value)', arg=contact)
                    check(page.evaluate('navigator.clipboard.readText()') == contact, f'{person}: contact copies correctly')
                check(page.locator('.leadership-grid img').count() == 0, 'Unprovided portraits do not produce broken images or empty photo frames')

        # Real copy fallback, then a forced denial to exercise honest failure feedback.
        route(page, '/world/dengfu')
        page.evaluate("window.savedClipboard=navigator.clipboard;Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined})")
        page.locator('.world-contact [data-copy]').click()
        check(page.evaluate('window.savedClipboard.readText()') == '837447730', 'Clipboard fallback copies the real number without the modern API')
        page.evaluate("window.savedExec=document.execCommand;document.execCommand=()=>false")
        page.locator('.world-contact [data-copy]').click()
        check('手动复制' in page.locator('.world-contact .copy-feedback').inner_text(), 'Copy denial offers manual selection instead of claiming success')
        check(page.locator('body > textarea').count() == 0, 'Temporary clipboard field is removed')
        page.evaluate("document.execCommand=window.savedExec;Object.defineProperty(navigator,'clipboard',{configurable:true,value:window.savedClipboard})")
        page.locator('.world-contact > strong').click(button='right')
        check(page.evaluate('location.hash') == '#/world/dengfu', 'Right-click on a contact number keeps the server open for native selection')

        for width, height in [(1920, 1080), (1440, 900), (1280, 720), (1024, 768), (768, 1024), (640, 960), (390, 844), (320, 700), (844, 390)]:
            page.set_viewport_size({'width': width, 'height': height})
            route(page, '/home')
            page.locator('.organization-row').first.evaluate('(e)=>e.open=true')
            page.locator('#organizations').scroll_into_view_if_needed()
            page.wait_for_timeout(80)
            geo = page.evaluate('''()=>{
              const title=document.querySelector('.keepers-heading').getBoundingClientRect(),list=document.querySelector('.keepers-list').getBoundingClientRect(),label=document.querySelector('.keepers-heading .humanity-side-label').getBoundingClientRect(),emblem=document.querySelector('.keepers-heading .humanity-emblem').getBoundingClientRect();
              return {title:{x:title.x,y:title.y,bottom:title.bottom},list:{right:list.right,y:list.y,bottom:list.bottom},labelOverlapsEmblem:label.left<emblem.right&&label.right>emblem.left&&label.top<emblem.bottom&&label.bottom>emblem.top,overflow:document.documentElement.scrollWidth>innerWidth+1};
            }''')
            check(not geo['overflow'] and not geo['labelOverlapsEmblem'], f'{width}x{height}: institution text and seal fit')
            if width > 760:
                check(geo['title']['x'] >= geo['list']['right'] and abs(geo['title']['bottom'] - geo['list']['bottom']) < 1, f'{width}x{height}: right-hand heading aligns with the left column')
            else:
                check(geo['title']['bottom'] <= geo['list']['y'] + 1, f'{width}x{height}: mobile heading comes before readable institution text')
            if width in [1440, 390]:
                page.locator('#organizations').screenshot(path=str(OUTPUT / f'content-keepers-{width}.png'))
            row = {'width': width, 'height': height, 'home': geo, 'worlds': []}
            for ident, *_ in expected:
                route(page, '/world/' + ident)
                fit = boxes_fit(page)
                check(not fit['outside'] and not fit['shellOverflow'] and not fit['documentOverflow'], f'{width}x{height}: {ident} introduction and decorations stay within the reading area')
                if width in [1440, 390] and ident == 'dengfu':
                    snap(page, f'content-world-{width}.png')
                page.locator('[data-tab="leaders"]').click()
                leaders_fit = boxes_fit(page)
                check(not leaders_fit['outside'] and not leaders_fit['shellOverflow'], f'{width}x{height}: {ident} leadership and contact controls fit')
                if width in [1440, 390] and ident == 'dengzhu':
                    page.locator('.leadership-grid').scroll_into_view_if_needed()
                    snap(page, f'content-leaders-{width}.png')
                row['worlds'].append({'id': ident, 'intro': fit, 'leaders': leaders_fit})
            layouts.append(row)

        touch_context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, reduced_motion='reduce')
        mobile = touch_context.new_page()
        mobile.on('pageerror', lambda error: errors.append(str(error)))
        mobile.goto(URL + '#/world/dengfu')
        ready(mobile)
        number_box = mobile.locator('.world-contact > strong').bounding_box()
        session = touch_context.new_cdp_session(mobile)
        session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': number_box['x'] + 12, 'y': number_box['y'] + 8, 'id': 0}]})
        mobile.wait_for_timeout(850)
        session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        check(mobile.evaluate('location.hash') == '#/world/dengfu' and not mobile.locator('#hold-indicator').evaluate("e=>e.classList.contains('is-holding')"), 'Long-press on a phone number does not trigger the coast-return gesture')
        touch_context.close()

        local = context.new_page()
        local.on('pageerror', lambda error: errors.append(str(error)))
        local.goto((ROOT / 'index.html').as_uri() + '#/world/dengzhu')
        ready(local)
        check(local.locator('.world-english').inner_text() == 'Beacreative' and local.locator('.archive-prose p').count() == 4 and local.locator('.flag-cloth img').evaluate('(e)=>e.naturalWidth>0'), 'Double-click local-file browsing loads the new styles, copy and flag')
        check(not errors, 'No browser script errors throughout content acceptance')
        completed = True
        browser.close()
finally:
    server.shutdown()
    (OUTPUT / 'content-verification.json').write_text(json.dumps({'completed': completed, 'checks': checks, 'errors': errors, 'layouts': layouts}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Completed: {completed}; checks: {len(checks)}; script errors: {len(errors)}', flush=True)
