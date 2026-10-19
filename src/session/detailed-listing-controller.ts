export const detailedListingController = String.raw`
(() => {
  document.documentElement.classList.add('js');
  const main = document.querySelector('main');
  const cards = [...document.querySelectorAll('.session-card[data-main="true"]')];
  const occurrences = [...document.querySelectorAll('#occurrence-table tbody tr[data-conversation]')];
  const input = id => document.getElementById(id);
  const search = input('search'), type = input('type'), status = input('status'), model = input('model'), project = input('project');
  const quick = [...document.querySelectorAll('[data-chip]')];
  const pins = new Map();
  const normalize = text => text.toLowerCase().replace(/\s+/g,' ').trim();
  const content = element => {
    const parts = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while(walker.nextNode()) {
      const node = walker.currentNode;
      if(!node.parentElement.closest('button, th, dt, h3, summary, .caption, .unknown')) parts.push(node.nodeValue);
    }
    for(const node of element.querySelectorAll('[data-copy], [data-search]')) {
      if(node.dataset.copy) parts.push(node.dataset.copy);
      if(node.dataset.search) parts.push(node.dataset.search);
    }
    if(element.dataset.search) parts.push(element.dataset.search);
    return normalize(parts.join(' '));
  };
  // Shared fragments stay shared: occurrence rows never index another workspace's provenance.
  const indexes = new Map();
  const conversations = new Map();
  for(const card of document.querySelectorAll('.session-card')) {
    const shared = [...card.querySelectorAll('.prompt-preview, .full-prompt pre, .turn-meta, .turn-card tbody')].map(content);
    if(card.dataset.search) shared.push(normalize(card.dataset.search));
    const scoped = [...card.querySelectorAll('[data-search-refs]')].map(element=>({
      refs: element.dataset.searchRefs.split(' '), text: content(element)
    }));
    const title = normalize(card.dataset.title || '');
    const all = [title, ...shared, ...scoped.map(item=>item.text), normalize(card.dataset.models || '[]')];
    conversations.set(card.id,{shared,title,scoped});
    indexes.set(card,all);
  }
  for(const row of occurrences) {
    const conversation = conversations.get(row.dataset.conversation);
    if(!conversation) throw new Error('Missing search conversation: '+row.dataset.conversation);
    indexes.set(row,[
      conversation.title, ...conversation.shared,
      ...conversation.scoped.filter(item=>item.refs.includes(row.dataset.reference)).map(item=>item.text),
      normalize(row.dataset.models || '[]'), content(row)
    ]);
  }
  let view = input('view').value || 'grouped';
  let direction = main.dataset.pendingDirection === '1' ? 1 : -1;
  let attention = main.dataset.pendingAttention || '';
  const numeric = (row,key,minId,maxId,unknownId) => {
    const value = row.dataset[key], unknown = input(unknownId).value;
    const known = value !== '';
    if(unknown === 'unknown') return !known;
    if(unknown === 'known' && !known) return false;
    const min = input(minId).value, max = input(maxId).value;
    if((min || max) && !known) return false;
    return (!min || Number(value)>=Number(min)) && (!max || Number(value)<=Number(max));
  };
  const match = (row,words) => {
    if(!words.every(word=>indexes.get(row).some(text=>text.includes(word)))) return false;
    if(type.value && row.dataset.type!==type.value) return false;
    if(status.value && row.dataset.status!==status.value) return false;
    const models = JSON.parse(row.dataset.models || '[]');
    if(model.value && (model.value === '?' ? models.length>0 : !models.includes(model.value))) return false;
    if(project && project.value) {
      const projects = JSON.parse(row.dataset.projects || '[]');
      if(project.value === '__multi' ? projects.length<2 : project.value === '__unknown' ? projects.length>0 : !projects.includes(project.value)) return false;
    }
    const flags = (row.dataset.chips || '').split(' ');
    if(!quick.filter(button=>button.getAttribute('aria-pressed')==='true').every(button=>flags.includes(button.dataset.chip))) return false;
    if(attention && !flags.includes(attention)) return false;
    if(!numeric(row,'prompts','prompts-min','prompts-max','prompts-known')) return false;
    if(!numeric(row,'bytes','bytes-min','bytes-max','bytes-known')) return false;
    const key = input('date-kind').value, date = row.dataset[key+'Day'] || '';
    const from = input('date-from').value, to = input('date-to').value;
    if((from || to) && (!date || (from && date<from) || (to && date>to))) return false;
    return true;
  };
  const apply = () => {
    const words = normalize(search.value).split(' ').filter(Boolean);
    const rows = view === 'grouped' ? cards : occurrences;
    for(const row of cards) row.hidden = !match(row,words) || row.dataset.limited==='true';
    for(const row of occurrences) row.hidden = !match(row,words) || row.dataset.limited==='true';
    const count = rows.filter(row=>!row.hidden).length;
    input('row-count').textContent = count+' of '+rows.length+' '+(view==='grouped'?'grouped conversations':'workspace occurrences')+' shown';
    input('grouped-view').hidden = view!=='grouped';
    input('occurrence-view').hidden = view!=='occurrences';
  };
  const reset = () => {
    for(const field of document.querySelectorAll('[data-filter]')) field.value = field.dataset.default || '';
    for(const button of quick) button.setAttribute('aria-pressed','false');
    attention = '';
    apply();
  };
  for(const field of document.querySelectorAll('[data-filter]')) {
    field.addEventListener('input',apply);
    field.addEventListener('change',apply);
  }
  for(const button of quick) button.addEventListener('click',()=>{
    button.setAttribute('aria-pressed',button.getAttribute('aria-pressed')==='true'?'false':'true'); apply();
  });
  input('reset').addEventListener('click',reset);
  for(const button of document.querySelectorAll('[data-attention]')) button.addEventListener('click',()=>{
    reset();
    attention = button.dataset.attention;
    apply();
    input('search').scrollIntoView({block:'center'});
    input('action-status').textContent='Filtered to chats flagged "'+attention+'". Use Reset filters to clear it.';
  });
  for(const button of document.querySelectorAll('[data-project-pick]')) button.addEventListener('click',()=>{
    if(!project) return;
    project.value = button.dataset.projectPick;
    apply();
    input('search').scrollIntoView({block:'center'});
    input('action-status').textContent='Filtered to the chosen project. Use Reset filters to clear it.';
  });
  input('show-all').addEventListener('click',()=>{
    for(const row of [...cards,...occurrences]) row.dataset.limited='false';
    input('action-status').textContent='Newest-25 limit removed for this page; ignored sessions remain in their own section.';apply();
  });
  input('view').addEventListener('change',()=>{view=input('view').value;apply();});
  const density = () => {
    main.classList.toggle('compact',input('density').value==='compact');
    main.classList.toggle('comprehensive',input('density').value==='comprehensive');
    for(const details of document.querySelectorAll('.session-card, .session-card details')) details.open=input('density').value==='comprehensive';
  };
  input('density').addEventListener('change',density);
  const sort = () => {
    const key = input('sort').value;
    const compare = (a,b) => {
      const x=a.dataset[key] || '',y=b.dataset[key] || '';
      if(!x||!y) return !x?(!y?0:1):-1;
      const value = ['created','updated','prompts','bytes'].includes(key) ? Number(x)-Number(y) : x.localeCompare(y,undefined,{numeric:true});
      return direction*value || a.id.localeCompare(b.id);
    };
    cards.sort(compare).forEach(card=>input('grouped-view').append(card));
    occurrences.sort(compare).forEach(row=>input('occurrence-table').tBodies[0].append(row));apply();
  };
  input('sort').addEventListener('change',sort);
  input('sort-direction').addEventListener('click',()=>{
    direction=-direction;input('sort-direction').textContent=direction===1?'⬆️ Ascending':'⬇️ Descending';sort();
  });
  const reveal = id => {
    const target=input(id);
    if(!target) {input('action-status').textContent='Target is not present in this report snapshot.';return;}
    reset();view='grouped';input('view').value='grouped';
    let card = target.closest('.session-card');
    if(card && card.dataset.main==='true') card.dataset.limited='false';
    apply();
    let parent=target;
    while(parent){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}
    if(card){card.hidden=false;card.classList.add('target');setTimeout(()=>card.classList.remove('target'),2500);}
    target.scrollIntoView({block:'start'});target.setAttribute('tabindex','-1');target.focus({preventScroll:true});
    input('action-status').textContent='Opened linked conversation and reset filters. Ignored/limited targets are revealed without changing source identity.';
  };
  for(const link of document.querySelectorAll('a[href^="#"]')) link.addEventListener('click',()=>{
    const id=decodeURIComponent(link.getAttribute('href').slice(1));reveal(id);
  });
  window.addEventListener('hashchange',()=>location.hash && reveal(decodeURIComponent(location.hash.slice(1))));
  const comparison = () => {
    const box=input('comparison-cards');box.replaceChildren();
    for(const [id,card] of pins){
      const section=document.createElement('section');
      const heading=document.createElement('h3');heading.textContent=card.dataset.title;section.append(heading);
      const grids=card.querySelector('.comparison-summary').cloneNode(true);
      for(const element of grids.querySelectorAll('[id]'))element.removeAttribute('id');
      section.append(grids);box.append(section);
    }
    input('comparison').hidden=pins.size===0;
    input('comparison-count').textContent=pins.size+' of 2 chats pinned';
  };
  for(const button of document.querySelectorAll('[data-pin]')) button.addEventListener('click',()=>{
    const card=button.closest('.session-card'),id=button.dataset.pin;
    if(pins.has(id)){pins.delete(id);button.setAttribute('aria-pressed','false');}
    else if(pins.size<2){pins.set(id,card);button.setAttribute('aria-pressed','true');}
    else{input('action-status').textContent='Two chats are pinned. Unpin one before adding another.';}
    comparison();
  });
  input('clear-pins').addEventListener('click',()=>{
    pins.clear();for(const button of document.querySelectorAll('[data-pin]'))button.setAttribute('aria-pressed','false');comparison();
  });
  for(const button of document.querySelectorAll('[data-copy]')) button.addEventListener('click',async()=>{
    try{
      await navigator.clipboard.writeText(button.dataset.copy);
      input('action-status').textContent='Copied to clipboard.';
    }catch{
      input('action-status').textContent='Clipboard unavailable for this local page. Select and copy the adjacent text manually.';
    }
  });
  if(main.dataset.pendingAll === 'true')
    for(const row of [...cards,...occurrences]) row.dataset.limited='false';
  if(input('density').value && input('density').value !== 'balanced') density();
  if(main.dataset.pendingDirection || (input('sort').value && input('sort').value !== 'updated')) sort();
  apply();
  if(location.hash)reveal(decodeURIComponent(location.hash.slice(1)));
})();
`;
