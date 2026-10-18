(() => {
  'use strict';
  const data = window.SITE_DATA;
  const root = document.documentElement;
  const home = document.getElementById('home-content');
  const detail = document.getElementById('detail-shell');
  const content = document.getElementById('detail-content');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const url = value => { try { const u = new URL(value); return ['https:','http:'].includes(u.protocol) ? esc(u.href) : ''; } catch { return ''; } };
  const color = (value, fallback) => /^#[a-f\d]{6}$/i.test(value || '') ? value : fallback;
  const number = value => String(value).padStart(2,'0');
  const paragraphs = value => String(value || '').trim().split(/\n\s*\n/).filter(Boolean).map(p=>`<p>${esc(p)}</p>`).join('');
  const worldUrl = world => `#/world/${encodeURIComponent(world.id)}`;
  const partnerId = (partner,index) => String(partner.id || `partner-${index+1}`);
  const seedTheme = {id:'seed',color:'#a8c7b4',ink:'#35624e',tint:'#eef5ef'};
  const seedPlanTheme = {id:'seed-plan',color:'#c3d3b4',ink:'#155e2b',tint:'#f1f5e8'};
  const neutralTheme = {id:'coast',color:'#9bc9fe',ink:'#275b95',tint:'#edf5ff'};
  let version=0, isDetail=false, currentRoute='', routeAnimation=null, bootRunning=false;
  let lastWorldNode=null, seedPage=0, revealObserver=null, holdTimer=0, holdPoint=null, suppressClickUntil=0;
  const seedEntries = data.partners.length ? data.partners.map((p,i)=>({id:partnerId(p,i),name:p.name || '未命名服务器',sub:p.type || '种子计划',color:p.color || seedTheme.color,href:`#/partner/${encodeURIComponent(partnerId(p,i))}`,placeholder:false})) : Array.from({length:4},(_,i)=>({id:`slot-${i+1}`,name:`种子 ${number(i+1)}`,sub:'待公布',color:seedTheme.color,href:`#/seed/slot-${i+1}`,placeholder:true}));

  function records(items, title) {
    if(!items?.length)return `<div class="empty-state"><span class="empty-mark" aria-hidden="true">⌁</span><div><h3>${esc(title)}，正在整理。</h3><p>正式资料将在这里陆续公布。</p></div></div>`;
    return `<ol class="record-list">${items.map(item=>`<li><time>${esc(item.date)}</time><div><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p></div></li>`).join('')}</ol>`;
  }
  function members(items,empty='成员名单待公布') {
    return items?.length ? `<div class="member-list">${items.map(p=>`<div><span>${esc(p.role)}</span><strong>${esc(p.name || '待公布')}</strong></div>`).join('')}</div>` : `<p class="quiet-note">${empty}</p>`;
  }
  function copyControl(value,label){
    return `<button class="contact-copy" type="button" data-copy="${esc(value)}" aria-label="复制${esc(label)}"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="9" height="10" rx="1.5"/><path d="M12 7V3H3v10h4"/></svg><span class="copy-action">复制</span></button><span class="copy-feedback" role="status"></span>`;
  }
  function worldLeadership(world){
    if(world?.leadershipNote)return `<div class="archive-prose leadership-note">${paragraphs(world.leadershipNote)}</div>`;
    if(!world?.leaders?.length)return '<p class="quiet-note">领导成员待公布</p>';
    return `<div class="leadership-grid">${world.leaders.map(person=>`<article class="leader-entry${person.name?'':' is-unfilled'}"><span class="leader-role">${esc(person.role)}</span><h3>${esc(person.name || person.status || '待公布')}</h3>${person.handle?`<p class="leader-handle">（${esc(person.handle)}）</p>`:''}${person.contact?`<div class="member-contact" data-contact><span>联系方式</span><strong>${esc(person.contact)}</strong>${copyControl(person.contact,`${person.name}的联系方式`)}</div>`:''}</article>`).join('')}</div>`;
  }
  function archiveContent(scope,tab) {
    const world=data.worlds.find(w=>w.id===scope);
    if(tab==='history')return records((world || data).history,'历史档案');
    if(tab==='personnel')return records(data.personnel,'人员调度');
    if(tab==='leaders')return worldLeadership(world);
    const description=world ? world.summary : data.overview;
    return description ? `<div class="archive-prose">${paragraphs(description)}</div>` : `<div class="empty-state"><span class="empty-mark" aria-hidden="true">⌁</span><div><h3>${world ? '这座世界的故事，静待展开。' : '共同的故事，正在续写。'}</h3><p>${world ? esc(world.name)+'的正式介绍待公布。' : '灯塔服务器体系的正式介绍待公布。'}</p></div></div>`;
  }
  function archive(scope,system=false) {
    const tabs=system?[['intro','体系介绍'],['history','历史档案'],['personnel','人员调度']]:[['intro','服务器介绍'],['leaders','领导成员']];
    return `<div class="archive" data-scope="${esc(scope)}"><div class="archive-tabs" role="tablist" aria-label="${system?'体系':'服务器'}资料">${tabs.map(([id,label],i)=>`<button id="tab-${esc(scope)}-${id}" type="button" role="tab" data-tab="${id}" aria-selected="${i===0}" aria-controls="panel-${esc(scope)}" tabindex="${i===0?0:-1}">${label}</button>`).join('')}</div><div class="archive-content" id="panel-${esc(scope)}" role="tabpanel" tabindex="0" aria-labelledby="tab-${esc(scope)}-intro">${archiveContent(scope,'intro')}</div></div>`;
  }
  const brandText = `<span class="brand-text"><strong>灯塔服务器体系</strong><small>Beaconia Network</small></span>`;
  const brand = `<img class="brand-icon" src="assets/brand-icon-blue.png" width="269" height="319" alt="" aria-hidden="true">${brandText}`;
  const footerBrand = `<img class="brand-icon" src="assets/brand-icon-green.png" width="269" height="319" alt="" aria-hidden="true">${brandText}`;
  function homePage(){
    return `<section class="landing" aria-labelledby="home-title">
      <a class="coast-brand" href="#/home" aria-label="灯塔服务器体系首页">${brand}</a>
      <div class="edition micro"><i></i>灯塔服务器体系官网</div>
      <div class="hero-copy"><p class="eyebrow light"><span></span><b>人本、人文、人情<wbr>——让每一束微光，都有归处</b></p><h1 id="home-title">循着灯火，<br>找到你的<span>世界。</span></h1></div>
      <span class="coast-side-note micro">A SHORE FOR EVERY WORLD</span>
      <div class="hero-bottom"><span class="sea-instruction"><i></i>轻触海上节点，探索一座世界</span><a href="#system-overview" data-scroll="system-overview" class="scroll-invitation"><span class="micro">BEYOND THE HORIZON</span><b>向下，认识灯塔 <i>↓</i></b></a><span class="hero-signature micro">FOUR WORLDS. ONE LIGHT.</span></div>
    </section>
    <div class="home-sections"><svg class="shore-threshold" viewBox="0 0 1440 380" preserveAspectRatio="none" aria-hidden="true"><path d="M0 380C27 380 35 310 52 229L84 83Q101 8 205 8H1235Q1339 8 1356 83L1388 229C1405 310 1413 380 1440 380Z"/></svg>
      <section class="epigraph section-wrap" id="system-overview" aria-labelledby="home-inscription">
        <blockquote class="reveal"><p class="epigraph-text" id="home-inscription">此心安处是吾乡</p><cite class="epigraph-credit">——苏轼《定风波》</cite></blockquote>
      </section>
      <section class="humanity-section section-wrap" id="system-introduction" aria-labelledby="system-title">
        <div class="humanity-layout">
          <div class="humanity-heading"><span class="humanity-emblem" aria-hidden="true"><svg viewBox="0 0 56 68" focusable="false"><path d="M20 24h16l4 29H16l4-29Z"/><path d="M17 24h22L28 14 17 24Z"/><path d="M19 31h18M21 31v-7M35 31v-7M23 39v12M33 39v12"/><circle cx="28" cy="18" r="2"/><path d="M31 18h17M8 58c7-5 11 5 19 0s12 5 21 0"/></svg><b class="micro">01</b></span><h2 class="humanity-title reveal" id="system-title" aria-label="四海同光"><span aria-hidden="true">四</span><span aria-hidden="true">海</span><span aria-hidden="true">同</span><span aria-hidden="true">光</span></h2><p class="humanity-side-label reveal">灯塔服务器体系介绍</p></div>
          <div class="humanity-prose">${String(data.overview || '').trim().split(/\n\s*\n/).filter(Boolean).map(paragraph=>`<p class="reveal">${esc(paragraph).replace('人本、人文、人情','<strong>人本、人文、人情</strong>').replace('共同建设、共同治理、共同传承','<strong>共同建设、共同治理、共同传承</strong>')}</p>`).join('')}</div>
        </div>
      </section>
      <section class="organization-section keepers-section section-wrap" id="organizations" aria-labelledby="organization-title">
        <div class="keepers-layout"><div class="organization-list keepers-list">${data.organizations.map((o,i)=>`<details class="organization-row reveal" name="beaconia-organizations"${i===0?' open':''}><summary><span class="org-number micro" aria-hidden="true">${number(i+1)}</span><span class="org-symbol" aria-hidden="true">${esc(o.symbol)}</span><h3 class="org-name">${esc(o.name)}</h3><span class="org-toggle" aria-hidden="true">＋</span></summary><div class="organization-body"><div class="organization-prose">${paragraphs(o.description || '组织介绍待公布。')}</div></div></details>`).join('')}</div>
          <div class="humanity-heading keepers-heading"><span class="humanity-emblem" aria-hidden="true"><svg viewBox="0 0 56 68" focusable="false"><path d="M28 12v7M28 49v7M8 34h7M41 34h7M14 20l5 5M37 43l5 5M14 48l5-5M37 25l5-5"/><circle cx="28" cy="34" r="14"/><path d="m28 22 4 8 8 4-8 4-4 8-4-8-8-4 8-4Z"/><path d="M16 61h24"/></svg><b class="micro">02</b></span><h2 class="humanity-title reveal" id="organization-title" aria-label="同心守望"><span aria-hidden="true">同</span><span aria-hidden="true">心</span><span aria-hidden="true">守</span><span aria-hidden="true">望</span></h2><p class="humanity-side-label reveal"><span>灯塔服系联合领导团</span><span>“一组三会”介绍</span></p></div>
        </div>
      </section>
      <section class="seed-invitation section-wrap reveal" aria-labelledby="seed-title"><div class="seed-orbits" aria-hidden="true"><i></i><i></i><i></i><b>✦</b></div><div><span class="micro">03 / The Seed Plan</span><h2 id="seed-title">让下一束光，<br>也找到海岸。</h2><p class="seed-description"><strong>面向系外服务器的援助与共建计划</strong><span>让经验与支持，陪伴更多世界生长。</span></p><a class="line-link" href="#/seed">走进种子计划 <span>↗</span></a></div></section>
      <footer class="site-footer section-wrap"><div><a class="footer-brand" href="#/home">${footerBrand}</a><p>人本、人文、人情——让每一束微光，都有归处。</p></div><div class="footer-destinations">${url(data.forumUrl)?'<a href="#/community">社区论坛 <span>↗</span></a>':'<div class="footer-disabled" aria-disabled="true" title="社区论坛暂未开放">社区论坛 <span aria-hidden="true">↗</span></div>'}<a href="#/seed">种子计划 <span>↗</span></a><button id="replay-boot" type="button">重播海岸开场 <span>↻</span></button></div><div class="footer-bottom micro"><span>© ${new Date().getFullYear()} Beaconia Network</span><span>FOUR WORLDS. ONE LIGHT.</span><a href="#/home">回到海岸 ↑</a></div></footer>
    </div>`;
  }
  function worldPage(world){
    const i=data.worlds.indexOf(world);
    const next=data.worlds[(i+1)%data.worlds.length];
    return `<article class="world-page"><div class="world-hero"><div class="world-title"><p class="eyebrow">${esc(world.type)}</p><h1>${esc(world.name)}</h1><p class="world-english">${esc(world.english)}</p><p class="world-invitation">${esc(world.tagline)}</p>${world.group||world.groupStatus?`<div class="world-contact" data-contact><span>群号</span><strong>${esc(world.group || world.groupStatus)}</strong>${world.group?copyControl(world.group,`${world.name}群号`):''}</div>`:''}</div><figure class="flag-dais"><span class="flag-orbit" aria-hidden="true"></span><div class="flag-cloth"><img src="${esc(world.flag)}" alt="${esc(world.name)}旗帜" width="1440" height="960" draggable="false"></div><span class="world-watermark" aria-hidden="true">${esc(world.word)}</span></figure></div>
      ${archive(world.id)}
      <div class="detail-bottom"><a href="${worldUrl(next)}">下一座 · ${esc(next.name)} <span>→</span></a></div></article>`;
  }
  function seedDossier(plan){
    if(!plan)return `<div class="archive-prose"><p>${esc(data.seedDescription || '种子计划是灯塔面向其他服务器的援助计划。具体计划说明与援助安排待公布。')}</p></div>`;
    const item=entry=>`<div class="seed-item"><h4>${esc(entry.name)}</h4>${paragraphs(entry.text)}${entry.list?`<ol class="seed-list">${entry.list.map(line=>`<li>${esc(line)}</li>`).join('')}</ol>`:''}</div>`;
    const file=(entry,index)=>`<details class="seed-file"${index===0?' open':''}><summary><span class="seed-file-number micro" aria-hidden="true">${number(index+1)}</span><span class="seed-file-title">${esc(entry.title)}</span><span class="seed-file-label micro" aria-hidden="true">${esc(entry.label || '')}</span><span class="seed-file-toggle" aria-hidden="true">＋</span></summary><div class="seed-file-body">${entry.note?`<p class="seed-note">${esc(entry.note)}</p>`:''}${entry.text?`<div class="seed-text">${paragraphs(entry.text)}</div>`:''}${(entry.items || []).map(item).join('')}</div></details>`;
    return `<section class="seed-chapter seed-about" aria-labelledby="seed-about-title">
      <header class="seed-chapter-head"><span class="seed-chapter-index micro" aria-hidden="true">01</span><h2 class="seed-chapter-title" id="seed-about-title">关于种子计划</h2><span class="seed-chapter-label micro" aria-hidden="true">A LIGHT FOR OTHERS</span></header>
      <div class="seed-prose">${(plan.intro || []).map(text=>`<p>${esc(text)}</p>`).join('')}</div>
    </section>
    <section class="seed-chapter seed-offer" aria-labelledby="seed-offer-title">
      <header class="seed-chapter-head"><span class="seed-chapter-index micro" aria-hidden="true">02</span><h2 class="seed-chapter-title" id="seed-offer-title">我们能为你提供什么？</h2><span class="seed-chapter-label micro" aria-hidden="true">WHAT WE OFFER</span></header>
      <div class="seed-scope"><div class="seed-scope-head"><span class="micro">IMPORTANT / 适用范围</span><h3>重要适用范围说明</h3></div><p class="seed-scope-lead">${esc(plan.scope.lead)}</p><div class="seed-scope-grid"><article><span class="micro">BE · 基岩版服务器</span>${paragraphs(plan.scope.be)}</article><article><span class="micro">JE · Java 版服务器</span>${paragraphs(plan.scope.je)}</article></div></div>
      <p class="seed-hint"><span>对于以下部分，请点按对应部分标题查看详情</span></p>
      <div class="seed-files">${(plan.sections || []).map(file).join('')}</div>
      <p class="seed-download"><a href="assets/seed-plan-proposal.pdf" type="application/pdf" download>本页呈现内容与PDF下载内容一致，如您有对本计划相关知悉内容的留档需要，请点击此处，下载原提案PDF文件<span class="seed-download-arrow" aria-hidden="true">↓</span></a></p>
    </section>
    <section class="seed-outro" aria-labelledby="seed-outro-title"><span class="micro" id="seed-outro-title">TOGETHER / 期待与你同行</span><p>${esc(plan.outro)}</p><span class="seed-outro-mark" aria-hidden="true">✦</span></section>
    <p class="seed-contact" data-contact><span>种子计划报名咨询人：</span><b>一梦清音</b> <strong>2918407812</strong><span class="seed-copy-wrap">${copyControl('2918407812','种子计划报名咨询人号码')}</span></p>`;
  }
  function seedAid(plan){
    const aid=plan?.aid;
    if(!aid)return '';
    return `<section class="seed-partners" aria-labelledby="seed-aid-title"><p class="seed-partners-count" id="seed-aid-title">${esc(aid.prefix)}<b>${esc(aid.count)}</b>${esc(aid.suffix)}</p><p class="seed-partners-note">${esc(aid.note)}</p><p class="seed-partners-closing">${esc(aid.closing)}</p></section>`;
  }
  function seedPageContent(slot){
    if(slot)return `<article class="partner-page seed-slot-page"><div class="detail-topline"><span class="micro">Seed Plan / ${number(slot)}</span><span>合作服务器席位</span></div><div class="partner-hero"><span class="eyebrow">种子计划 · 席位 ${number(slot)}</span><h1>下一座世界，<br><em>静待点亮。</em></h1><p class="partner-description">此席位的合作服务器尚未公布。服务器名称、介绍与加入方式将在确认后展示。</p><a class="line-link" href="#/seed">了解种子计划 <span>→</span></a></div><div class="detail-bottom"><span class="micro">A NEW LIGHT ON THE COAST</span><a href="#/home">回到海岸 <span>↶</span></a></div></article>`;
    return `<article class="seed-page"><div class="detail-topline"><span class="micro">Beaconia Network / Seed Plan</span><span class="micro">OPEN HORIZONS</span></div><div class="seed-detail-hero"><span class="eyebrow">种子计划</span><h1>把一束光，<br><em>交给更多世界。</em></h1><p>每一束新的微光，都将在这片海上拥有自己的坐标。</p><img class="seed-detail-art seed-logo" data-transparent="true" src="assets/seed-plan-mark.png" width="1254" height="1254" alt="种子计划 · SEED PLAN"></div>${seedDossier(data.seedPlan)}${seedAid(data.seedPlan)}${data.partners.length ? `<div class="partner-list">${data.partners.map((p,i)=>`<a href="#/partner/${encodeURIComponent(partnerId(p,i))}"><span class="micro">${number(i+1)}</span><div><h3>${esc(p.name)}</h3><p>${esc(p.description || '服务器介绍待公布')}</p></div><span>↗</span></a>`).join('')}</div>` : ''}<div class="detail-bottom"><span class="micro">LET NEW WORLDS GROW</span><a href="#/home">回到海岸 <span>↶</span></a></div></article>`;
  }
  function partnerPage(partner,index){
    const website=url(partner.url);
    return `<article class="partner-page"><div class="detail-topline"><span class="micro">Seed Plan / ${number(index+1)}</span><span>合作服务器</span></div><div class="partner-hero"><span class="eyebrow">${esc(partner.type || '种子计划')}</span><h1>${esc(partner.name)}</h1>${partner.english?`<p class="micro">${esc(partner.english)}</p>`:''}${partner.flag?`<img class="partner-flag" src="${esc(partner.flag)}" alt="${esc(partner.name)}旗帜">`:''}<p class="partner-description">${esc(partner.description || '服务器介绍待公布。')}</p>${website?`<a class="solid-link" href="${website}" target="_blank" rel="noopener noreferrer">访问服务器官网 <span>↗</span></a>`:'<span class="status-note">官网地址待公布</span>'}</div>${partner.history?.length?`<div class="world-archive-heading"><span>历史档案</span></div>${records(partner.history,'历史档案')}`:''}${partner.leaders?.length?`<div class="world-archive-heading"><span>领导成员</span></div>${members(partner.leaders)}`:''}<div class="detail-bottom"><span class="micro">A NEW LIGHT ON THE COAST</span><a href="#/seed">关于种子计划 <span>→</span></a></div></article>`;
  }
  function communityPage(){
    const website=url(data.forumUrl);
    return `<article><div class="detail-topline"><span class="micro">Beaconia Network / COMMUNITY</span><span>社区论坛</span></div><div class="community-hero"><span class="eyebrow">STORIES CONTINUE HERE</span><h1>世界里的故事，<br><em>在这里继续。</em></h1><p>${website?'前往灯塔社区论坛，加入讨论。':'论坛正在筹备。正式入口公布后，就在这里相聚。'}</p>${website?`<a class="solid-link" href="${website}" target="_blank" rel="noopener noreferrer">前往论坛 <span>↗</span></a>`:'<button class="solid-link" type="button" disabled>论坛尚未开放 <span>↗</span></button>'}</div><div class="detail-bottom"><span class="micro">UNTIL WE MEET AGAIN</span><a href="#/home">回到海岸 <span>↶</span></a></div></article>`;
  }

  function nodeMarkup(entry,kind,index){
    const title=kind==='inner'?entry.name:`${entry.name}${entry.placeholder?' · 名单待公布':''}`;
    const lightColor=color(entry.color,seedTheme.color);
    const attributes=`class="sea-node ${kind==='inner'?'world-node':'seed-node'}${entry.placeholder?' is-pending':''}" data-node-id="${esc(entry.id)}" data-ring="${kind}" data-light-color="${lightColor}" style="--node-color:${lightColor}" aria-label="${esc(title)}" title="${esc(title)}"`;
    const body=`<span class="node-point" aria-hidden="true"><i></i></span><span class="node-label"><b>${esc(entry.name)}</b><small>${esc(kind==='inner'?entry.type:entry.sub)}</small></span><span class="node-order micro" aria-hidden="true">${number(index+1)}</span>`;
    // Pending seed seats keep their labels but are deliberately not links yet.
    if(kind==='inner'||!entry.placeholder)return `<a ${attributes} href="${kind==='inner'?worldUrl(entry):entry.href}">${body}</a>`;
    return `<span ${attributes} role="link" aria-disabled="true">${body}</span>`;
  }
  document.getElementById('inner-nodes').innerHTML=data.worlds.map((w,i)=>nodeMarkup(w,'inner',i)).join('');
  document.getElementById('outer-nodes').innerHTML=seedEntries.map((s,i)=>nodeMarkup(s,'outer',i)).join('');
  home.innerHTML=homePage();
  const flock=document.getElementById('sky-flock');
  const birdPositions=[[48,17,1],[55,20,.8],[61,14,.65],[66,19,.6]];
  flock.innerHTML=birdPositions.map(([x,y,size],i)=>{
    const note=data.skyNotes?.[i], hasNote=Boolean(note?.text);
    return `<button type="button" class="goose" style="--bird-x:${x}%;--bird-y:${y}%;--bird-scale:${size};--bird-delay:-${i*2}s" aria-label="${esc(hasNote?`${note.title || ''}${note.text}`:'海岸大雁，轻触让它振翅')}" ${hasNote?`aria-describedby="bird-note-${i}" aria-expanded="false"`:''}><svg viewBox="-30 -20 60 40" aria-hidden="true"><path class="goose-wing wing-left" d="M0 2Q-7-9-23-8Q-13-6-5 4Z"/><path class="goose-wing wing-right" d="M0 2Q8-12 24-16Q15-8 5 4Z"/><path class="goose-body" d="M-4 5 0 2 4-1Q6-5 8-4L11-3 7-2 4 5 1 8Z"/></svg>${hasNote?`<span class="bird-note" id="bird-note-${i}" role="tooltip" hidden><strong>${esc(note.title || '海岸来信')}</strong><span>${esc(note.text)}</span></span>`:''}</button>`;
  }).join('');
  function flap(bird){if(!motion.matches){bird.classList.remove('is-flapping');void bird.offsetWidth;bird.classList.add('is-flapping');}}
  flock.querySelectorAll('.goose').forEach(bird=>{
    const note=bird.querySelector('.bird-note');
    const show=()=>{flap(bird);if(note){note.hidden=false;bird.setAttribute('aria-expanded','true');}};
    const hide=()=>{if(note&&!bird.classList.contains('is-pinned')){note.hidden=true;bird.setAttribute('aria-expanded','false');}};
    bird.addEventListener('pointerenter',show);bird.addEventListener('focus',show);
    bird.addEventListener('pointerleave',hide);bird.addEventListener('blur',hide);
    bird.addEventListener('animationend',event=>{if(event.animationName==='wingBeat')bird.classList.remove('is-flapping');});
    bird.addEventListener('click',()=>{flap(bird);if(note){const pinned=bird.classList.toggle('is-pinned');note.hidden=!pinned;bird.setAttribute('aria-expanded',String(pinned));}});
    bird.addEventListener('keydown',event=>{if(event.key==='Escape'&&note){bird.classList.remove('is-pinned');note.hidden=true;bird.setAttribute('aria-expanded','false');}});
  });
  const cinema=window.createCoastCinema();
  window.coastCinema=cinema;
  const scene=window.createCoastScene();
  function showSeedGroup(page){
    const pages=Math.ceil(seedEntries.length/4);seedPage=Math.max(0,Math.min(pages-1,page));
    document.querySelectorAll('#outer-nodes .sea-node').forEach((node,i)=>node.hidden=Math.floor(i/4)!==seedPage);
    document.getElementById('seed-pager').hidden=pages<=1;
    document.getElementById('seed-page-count').textContent=`${seedPage+1} / ${pages}`;
    document.querySelector('[data-seed-page="-1"]').disabled=seedPage===0;
    document.querySelector('[data-seed-page="1"]').disabled=seedPage===pages-1;
    scene.refreshNodes();
  }
  showSeedGroup(0);
  function theme(model){
    root.style.setProperty('--accent',color(model.color,neutralTheme.color));
    root.style.setProperty('--accent-ink',color(model.ink,neutralTheme.ink));
    root.style.setProperty('--tint',color(model.tint,neutralTheme.tint));
    document.body.dataset.world=model.id || 'seed';
    document.querySelector('meta[name="theme-color"]').content=isDetail?color(model.tint,neutralTheme.tint):'#071c2d';
  }
  function reveals(){
    revealObserver?.disconnect();
    revealObserver=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-visible');revealObserver.unobserve(e.target);}}),{threshold:.08});
    home.querySelectorAll('.reveal').forEach(item=>revealObserver.observe(item));
  }
  function parseRoute(){
    let parts;
    try{parts=location.hash.replace(/^#\/?/,'').split('/').filter(Boolean).map(decodeURIComponent);}catch{return {kind:'missing',title:'航线未找到',theme:neutralTheme};}
    const [path='home',id]=parts;
    if(['home','overview','worlds','organization'].includes(path)&&parts.length===1 || !parts.length)return {kind:'home',section:path==='organization'?'organizations':null};
    if(path==='world'&&parts.length===2){const world=data.worlds.find(w=>w.id===id);if(world)return {kind:'world',world,title:world.name,node:world.id,theme:world};}
    if(path==='partner'&&parts.length===2){const index=data.partners.findIndex((p,i)=>partnerId(p,i)===id);if(index>=0){const p=data.partners[index];return {kind:'partner',partner:p,index,title:p.name,node:id,theme:{...seedTheme,...p,id}};}}
    if(path==='seed'&&parts.length<=2){const slot=/^slot-[1-4]$/.test(id||'')?Number(id.slice(-1)):null;if(!id||slot&&!data.partners.length)return {kind:'seed',slot,title:'种子计划',node:id,theme:slot?seedTheme:seedPlanTheme};}
    if(path==='community'&&parts.length===1)return {kind:'community',title:'社区论坛',theme:neutralTheme};
    return {kind:'missing',title:'航线未找到',theme:neutralTheme};
  }
  async function route(initial=false){
    const token=++version, destination=parseRoute(), wasDetail=isDetail;
    const source=wasDetail?cinema.capture():null;
    const requestedHash=location.hash,nextDetail=destination.kind!=='home';
    currentRoute=requestedHash;cancelHold();routeAnimation?.cancel();
    // Content, selected node and palette change in one commit after the old flag dissolves.
    function commitPage(fromSection=false){
      if(token!==version)return false;
      isDetail=nextDetail;
      document.body.dataset.view=isDetail?'detail':'home';
      document.body.classList.toggle('is-detail',isDetail);
      home.inert=isDetail;home.setAttribute('aria-hidden',String(isDetail));
      flock.inert=isDetail;
      document.getElementById('back-coast').tabIndex=isDetail?0:-1;
      document.querySelectorAll('.sea-node').forEach(node=>{
        if(isDetail&&destination.node===node.dataset.nodeId){node.setAttribute('aria-current','page');lastWorldNode=node;}
        else node.removeAttribute('aria-current');
      });
      if(destination.node){const index=seedEntries.findIndex(s=>s.id===destination.node);if(index>=0)showSeedGroup(Math.floor(index/4));}
      if(isDetail){
        window.scrollTo({top:0,behavior:'instant'});
        theme(destination.theme || neutralTheme);
        detail.hidden=false;detail.inert=false;
        // A section already breaks in place. Prepare the archive background in
        // this same frame instead of replaying the coast-to-navigation journey.
        if(!wasDetail||initial)scene.setMode(true,initial||fromSection);
        content.innerHTML=destination.kind==='world'?worldPage(destination.world):destination.kind==='seed'?seedPageContent(destination.slot):destination.kind==='partner'?partnerPage(destination.partner,destination.index):destination.kind==='community'?communityPage():`<article class="missing-page"><span class="eyebrow">404 / LOST AT SEA</span><h1>这条航线，<br><em>暂未点亮。</em></h1><p>页面地址不存在，循着灯火回到海岸吧。</p><a class="solid-link" href="#/home">返回海岸 ↶</a></article>`;
        detail.scrollTop=0;
        document.title=`${destination.title} · 灯塔服务器体系`;
        document.getElementById('route-announcement').textContent=`已进入${destination.title}。左侧双环可切换服务器，按 Escape 返回海岸。`;
        if(!initial)detail.focus({preventScroll:true});
      }
      document.body.dataset.route=requestedHash;
      return true;
    }
    if(wasDetail&&nextDetail&&!initial&&!bootRunning&&source){
      cinema.switchDetail({source,color:color((destination.theme||neutralTheme).color,neutralTheme.color),commit:commitPage});
      return;
    }
    if(!wasDetail&&destination.kind==='seed'&&!destination.slot&&!initial&&!bootRunning){
      const section=cinema.captureSeedSection();
      if(section){
        cinema.switchDetail({source:section,color:seedPlanTheme.color,commit:()=>commitPage(true),section:true});
        return;
      }
    }
    cinema.cancelTransition();commitPage();
    if(nextDetail){
      if(!initial&&!bootRunning)cinema.transition({source,fromDetail:wasDetail,color:color((destination.theme||neutralTheme).color,neutralTheme.color)});
      else cinema.refresh();
    } else {
      detail.inert=true;
      scene.setMode(false,initial);
      if(!initial&&wasDetail&&!bootRunning)cinema.transition({source,fromDetail:true,reverse:true,color:root.style.getPropertyValue('--accent')||neutralTheme.color,focus:lastWorldNode});
      theme(neutralTheme);
      document.title='灯塔服务器体系官网 · Beaconia Network';
      document.getElementById('route-announcement').textContent='已回到海岸首页';
      window.scrollTo({top:0,behavior:'instant'});
      if(!initial&&!motion.matches&&wasDetail){
        routeAnimation=content.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(18px)'}],{duration:300,fill:'forwards'});
        await routeAnimation.finished.catch(()=>{});
      }
      if(token!==version)return;
      detail.hidden=true;routeAnimation?.cancel();
      if(!initial)(lastWorldNode || document.getElementById('main')).focus({preventScroll:true});
      if(destination.section)document.getElementById(destination.section).scrollIntoView({behavior:initial||motion.matches?'instant':'smooth'});
    }
  }
  function goHome(){if(isDetail)location.hash='/home';}

  async function copyContact(button){
    const value=button.dataset.copy;
    if(!value||button.disabled)return;
    const feedback=button.parentElement.querySelector('.copy-feedback');
    const action=button.querySelector('.copy-action');
    button.disabled=true;
    let copied=false;
    try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);copied=true;}}catch{}
    if(!copied){
      const prior=document.activeElement,field=document.createElement('textarea');
      field.value=value;field.readOnly=true;field.setAttribute('aria-label','待复制的号码');
      field.style.cssText='position:fixed;left:-9999px;top:0;opacity:0';
      document.body.append(field);field.select();
      try{copied=document.execCommand('copy');}catch{}
      field.remove();if(prior?.isConnected)prior.focus({preventScroll:true});
    }
    button.disabled=false;
    if(!button.isConnected)return;
    action.textContent=copied?'已复制':'重试';
    feedback.textContent=copied?'号码已复制':'暂未复制，可选中号码手动复制';
    setTimeout(()=>{if(button.isConnected){action.textContent='复制';feedback.textContent='';}},2400);
  }

  // The hold gesture cancels on movement, scrolling, a second pointer or controls.
  function cancelHold(){clearTimeout(holdTimer);holdTimer=0;holdPoint=null;document.getElementById('hold-indicator').classList.remove('is-holding');}
  document.addEventListener('pointerdown',event=>{
    if(!isDetail||event.pointerType!=='touch')return;
    if(!event.isPrimary||event.target.closest('a,button,input,textarea,select,summary,[data-contact],[contenteditable="true"]')){cancelHold();return;}
    cancelHold();holdPoint={x:event.clientX,y:event.clientY,id:event.pointerId};
    const indicator=document.getElementById('hold-indicator');indicator.style.left=`${event.clientX}px`;indicator.style.top=`${event.clientY}px`;indicator.classList.add('is-holding');
    holdTimer=setTimeout(()=>{suppressClickUntil=performance.now()+700;cancelHold();goHome();},700);
  },{passive:true});
  document.addEventListener('pointermove',event=>{if(holdPoint&&(event.pointerId!==holdPoint.id||Math.hypot(event.clientX-holdPoint.x,event.clientY-holdPoint.y)>10))cancelHold();},{passive:true});
  ['pointerup','pointercancel'].forEach(name=>document.addEventListener(name,cancelHold,{passive:true}));
  detail.addEventListener('scroll',cancelHold,{passive:true});
  document.addEventListener('contextmenu',event=>{if(isDetail&&!event.target.closest('input,textarea,[data-contact],[contenteditable="true"]')){event.preventDefault();cancelHold();goHome();}});
  document.addEventListener('click',event=>{if(performance.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
  document.addEventListener('click',event=>{
    const copy=event.target.closest('[data-copy]');if(copy){copyContact(copy);return;}
    const scrollLink=event.target.closest('[data-scroll]');
    if(scrollLink){event.preventDefault();document.getElementById(scrollLink.dataset.scroll)?.scrollIntoView({behavior:motion.matches?'instant':'smooth'});return;}
    const node=event.target.closest('.sea-node');if(node&&node.matches('a[href]'))lastWorldNode=node;
    const page=event.target.closest('[data-seed-page]');if(page){showSeedGroup(seedPage+Number(page.dataset.seedPage));return;}
    const tab=event.target.closest('[data-tab]');
    if(tab){const panel=tab.closest('.archive');panel.querySelectorAll('[data-tab]').forEach(button=>{button.setAttribute('aria-selected',String(button===tab));button.tabIndex=button===tab?0:-1;});const pane=panel.querySelector('[role="tabpanel"]');pane.innerHTML=archiveContent(panel.dataset.scope,tab.dataset.tab);pane.setAttribute('aria-labelledby',tab.id);if(!motion.matches)pane.animate([{opacity:0,transform:'translateY(7px)'},{opacity:1,transform:'translateY(0)'}],{duration:320,easing:'ease-out'});}
    if(event.target.closest('#replay-boot'))showBoot(true);
    if(event.target.closest('#skip-content')){event.preventDefault();(isDetail?detail:document.getElementById('main')).focus();}
    const homeLink=event.target.closest('a[href="#/home"]');if(homeLink&&!isDetail&&location.hash==='#/home'){event.preventDefault();window.scrollTo({top:0,behavior:motion.matches?'instant':'smooth'});}
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&isDetail&&!bootRunning){event.preventDefault();goHome();}
    const tab=event.target.closest('[role="tab"]');
    if(tab&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const items=[...tab.parentElement.querySelectorAll('[role="tab"]')];let i=items.indexOf(tab);i=event.key==='Home'?0:event.key==='End'?items.length-1:(i+(event.key==='ArrowRight'?1:-1)+items.length)%items.length;items[i].focus();items[i].click();}
    const node=event.target.closest('.sea-node');
    if(node&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
      event.preventDefault();let list=[...node.parentElement.querySelectorAll('.sea-node:not([hidden])')],i=list.indexOf(node);
      if(event.key==='ArrowLeft'||event.key==='ArrowRight'){list=[...document.querySelectorAll(`#${node.dataset.ring==='inner'?'outer':'inner'}-nodes .sea-node:not([hidden])`)];i=Math.min(i,list.length-1);}
      else i=event.key==='Home'?0:event.key==='End'?list.length-1:(i+(event.key==='ArrowDown'?1:-1)+list.length)%list.length;
      list[i]?.focus({preventScroll:true});
    }
  });

  const resourcesState={done:0,total:data.worlds.length+3+(window.coast3D?1:0),failed:0};
  function loadImage(src){return new Promise(resolve=>{
    const image=new Image();let done=false;
    const finish=ok=>{if(done)return;done=true;clearTimeout(timeout);resourcesState.done++;if(!ok)resourcesState.failed++;resolve();};
    const timeout=setTimeout(()=>finish(false),8000);
    image.onload=()=>finish(true);image.onerror=()=>finish(false);image.src=src;
  });}
  const resources=Promise.allSettled([...data.worlds.map(w=>loadImage(w.flag)),loadImage('assets/seed-plan-logo.png'),loadImage(matchMedia('(max-aspect-ratio:1/1)').matches?'assets/coast-mobile-shore.svg':'assets/coast-shore.svg'),Promise.race([document.fonts?.ready || Promise.resolve(),delay(8000)]).then(()=>resourcesState.done++),...(window.coast3D?[window.coast3D.ready.then(()=>resourcesState.done++)]:[])]);
  const bootKey='dengta-sand-intro-v2';
  function visited(){try{return localStorage.getItem(bootKey)==='yes';}catch{return false;}}
  async function showBoot(replay=false){
    if(bootRunning)return;bootRunning=true;
    const boot=document.getElementById('boot'),shell=document.getElementById('site-shell'),skip=document.getElementById('boot-skip'),prior=document.activeElement;
    if(replay){location.hash='/home';await route();window.scrollTo({top:0,behavior:'instant'});}
    const skipAnimation=()=>cinema.shorten();
    const keyboard=event=>{if(['Escape','Enter'].includes(event.key)){event.preventDefault();event.stopPropagation();skipAnimation();}if(event.key==='Tab'){event.preventDefault();skip.focus();}};
    boot.hidden=false;boot.classList.remove('is-arriving');boot.style.setProperty('--departure','0');document.body.classList.add('booting');shell.inert=true;
    document.getElementById('boot-status').textContent='正在准备海岸与四座世界';
    skip.addEventListener('click',skipAnimation);boot.addEventListener('keydown',keyboard);skip.focus({preventScroll:true});
    await cinema.assemble(()=>resourcesState.done/resourcesState.total,resources);
    document.querySelector('.boot-meter').setAttribute('aria-valuenow','100');document.getElementById('boot-status').textContent=resourcesState.failed?'部分图像暂不可用，正在为你打开海岸。':'海岸已就绪';
    boot.hidden=true;shell.inert=false;document.body.classList.remove('booting');skip.removeEventListener('click',skipAnimation);boot.removeEventListener('keydown',keyboard);
    try{localStorage.setItem(bootKey,'yes');}catch{}
    if(replay&&prior?.isConnected)prior.focus({preventScroll:true});else (isDetail?detail:document.getElementById('main')).focus({preventScroll:true});
    bootRunning=false;
  }
  document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement){event.target.classList.add('image-unavailable');if(event.target.alt)event.target.alt+='（图像暂不可用）';}},true);
  window.addEventListener('hashchange',()=>route());
  window.addEventListener('pagehide',event=>{cancelHold();if(!event.persisted){scene.destroy();cinema.destroy();revealObserver?.disconnect();}});
  reveals();route(true);if(!visited())showBoot();else cinema.entrance();
})();
