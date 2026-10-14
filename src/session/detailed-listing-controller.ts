export const detailedListingController = String.raw`
(() => {
  document.documentElement.classList.add('js');
  const main = document.querySelector('main');
  const cards = [...document.querySelectorAll('.session-card[data-main="true"]')];
  const occurrences = [...document.querySelectorAll('#occurrence-table tbody tr[data-search]')];
  const input = id => document.getElementById(id);
  const search = input('search'), type = input('type'), status = input('status'), model = input('model');
  const quick = [...document.querySelectorAll('[data-chip]')];
  const pins = new Map();
  let view = 'grouped', direction = -1;
  const numeric = (row,key,minId,maxId,unknownId) => {
    const value = row.dataset[key], unknown = input(unknownId).value;
    const known = value !== '';
    if(unknown === 'unknown') return !known;
    if(unknown === 'known' && !known) return false;
    const min = input(minId).value, max = input(maxId).value;
    if((min || max) && !known) return false;
    return (!min || Number(value)>=Number(min)) && (!max || Number(value)<=Number(max));
  };
  const match = row => {
    const words = search.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if(!words.every(word=>row.dataset.search.includes(word))) return false;
    if(type.value && row.dataset.type!==type.value) return false;
    if(status.value && row.dataset.status!==status.value) return false;
    const models = JSON.parse(row.dataset.models || '[]');
    if(model.value && (model.value === '?' ? models.length>0 : !models.includes(model.value))) return false;
    const flags = (row.dataset.chips || '').split(' ');
    if(!quick.filter(button=>button.getAttribute('aria-pressed')==='true').every(button=>flags.includes(button.dataset.chip))) return false;
    if(!numeric(row,'prompts','prompts-min','prompts-max','prompts-known')) return false;
    if(!numeric(row,'bytes','bytes-min','bytes-max','bytes-known')) return false;
    const key = input('date-kind').value, date = row.dataset[key+'Day'] || '';
    const from = input('date-from').value, to = input('date-to').value;
    if((from || to) && (!date || (from && date<from) || (to && date>to))) return false;
    return true;
  };
  const apply = () => {
    const rows = view === 'grouped' ? cards : occurrences;
    for(const row of cards) row.hidden = !match(row) || row.dataset.limited==='true';
    for(const row of occurrences) row.hidden = !match(row) || row.dataset.limited==='true';
    const count = rows.filter(row=>!row.hidden).length;
    input('row-count').textContent = count+' of '+rows.length+' '+(view==='grouped'?'grouped conversations':'workspace occurrences')+' shown';
    input('grouped-view').hidden = view!=='grouped';
    input('occurrence-view').hidden = view!=='occurrences';
  };
  const reset = () => {
    for(const field of document.querySelectorAll('[data-filter]')) field.value = field.dataset.default || '';
    for(const button of quick) button.setAttribute('aria-pressed','false');
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
  input('show-all').addEventListener('click',()=>{
    for(const row of [...cards,...occurrences]) row.dataset.limited='false';
    input('action-status').textContent='Newest-25 limit removed for this page; ignored sessions remain in their own section.';apply();
  });
  input('view').addEventListener('change',()=>{view=input('view').value;apply();});
  input('density').addEventListener('change',()=>{
    main.classList.toggle('compact',input('density').value==='compact');
    main.classList.toggle('comprehensive',input('density').value==='comprehensive');
    for(const details of document.querySelectorAll('.session-card, .session-card details')) details.open=input('density').value==='comprehensive';
  });
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
  apply();
  if(location.hash)reveal(decodeURIComponent(location.hash.slice(1)));
})();
`;
