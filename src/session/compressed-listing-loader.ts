import { detailedListingController } from './detailed-listing-controller.ts';



const gzipDecode = String.raw`
      if(typeof DecompressionStream === 'undefined') throw new Error('This browser does not support native gzip decompression.');
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Uint8Array(await new Response(stream).arrayBuffer());`;
export function createListingCompressionLoader (controller = detailedListingController): string {
  return String.raw`
(() => {
  const main = document.querySelector('main');
  const status = document.getElementById('report-loading');
  const target = document.getElementById('compressed-content');
  const payload = document.getElementById('report-payload');
  const fromBase64 = text => {
    const packed = text;
    return typeof Uint8Array.fromBase64 === 'function'
      ? Uint8Array.fromBase64(packed) : Uint8Array.from(atob(packed),character=>character.charCodeAt(0));
  };
  const decode = async (bytes,expected) => {
DECODE
  };
  const input = id => document.getElementById(id);
  const pending = () => { status.textContent = 'Loading conversations. Your latest filters or link will be applied when ready.'; };
  const reset = () => {
    for(const field of document.querySelectorAll('[data-filter]')) field.value = field.dataset.default || '';
    for(const button of document.querySelectorAll('[data-chip]')) button.setAttribute('aria-pressed','false');
    delete main.dataset.pendingAttention;
  };
  const queueClick = event => {
    const button = event.target.closest('button, a[href^="#"]');
    if(!button) return;
    if(button.matches('a')) { pending(); return; }
    if(button.dataset.projectPick !== undefined) input('project').value = button.dataset.projectPick;
    else if(button.dataset.attention !== undefined) { reset(); main.dataset.pendingAttention = button.dataset.attention; }
    else if(button.dataset.chip !== undefined) button.setAttribute('aria-pressed',button.getAttribute('aria-pressed')==='true'?'false':'true');
    else if(button.id === 'reset') reset();
    else if(button.id === 'show-all') main.dataset.pendingAll = 'true';
    else if(button.id === 'sort-direction') {
      main.dataset.pendingDirection = main.dataset.pendingDirection === '1' ? '-1' : '1';
      button.textContent = main.dataset.pendingDirection === '1' ? 'Ascending' : 'Descending';
    } else return;
    pending();
  };
  const unqueue = () => {
    main.removeEventListener('click',queueClick);
    main.removeEventListener('input',pending);
    main.removeEventListener('change',pending);
  };
  main.addEventListener('click',queueClick);
  main.addEventListener('input',pending);
  main.addEventListener('change',pending);
  document.documentElement.classList.add('js');
  const initialize = () => {
CONTROLLER
  };
  const load = async () => {
    try {
      const packed = payload.textContent;
      const bytes = fromBase64(packed);
      const expected = Number(payload.dataset.bytes);
      const decoded = await decode(bytes,expected);
      if(decoded.byteLength !== expected) throw new Error('The decompressed byte count does not match this report.');
INTEGRITY
      const html = new TextDecoder('utf-8',{fatal:true}).decode(decoded);
      target.innerHTML = html;
      payload.remove();
      unqueue();
      initialize();
      document.documentElement.dataset.reportState = 'ready';
      status.textContent = 'Report ready. Search, conversation links, copying and comparison are available.';
    } catch(error) {
      unqueue();
      for(const control of main.querySelectorAll('input, select, button')) control.disabled = true;
      document.documentElement.dataset.reportState = 'error';
      status.textContent = 'Report could not be opened: '+(error instanceof Error ? error.message : String(error))+' Regenerate without --compressed or --compression for conventional HTML.';
      status.setAttribute('role','alert');
    }
  };
  document.documentElement.dataset.reportState = 'loading';
  if(typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('paint')) {
    const observer = new PerformanceObserver(list => {
      if(list.getEntries().some(entry=>entry.name === 'first-contentful-paint')) {
        observer.disconnect();
        setTimeout(load,0);
      }
    });
    observer.observe({type:'paint',buffered:true});
  } else {
    requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(load,0)));
  }
})();
`.replace('CONTROLLER', controller)
    .replace('DECODE', gzipDecode)
    .replace('INTEGRITY', '');
}
