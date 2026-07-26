// Друк HTML у новому вікні з кнопкою повернення (критично для смартфонів).
// Підтримує факсиміле: якщо у ФОПа завантажені stamp_path/signature_path,
// у панелі друку зʼявляється галочка «з факсиміле» (default: увімкнена).
// Плейсхолдер у HTML: <div id="fax-slot"></div> — на його місце вставляються
// зображення підпису+печатки. Без плейсхолдера — у правий нижній кут.

import { supabase } from '../lib/supabase';

const buildBar = (hasFax) => `
<div class="no-print" style="position:sticky;top:0;background:#0d3b33;padding:10px 14px;z-index:999;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
  <button onclick="window.close()" style="background:#fff;border:none;border-radius:8px;padding:10px 18px;font-size:15px;cursor:pointer">← Закрити</button>
  <button onclick="window.print()" style="background:#4ade80;border:none;border-radius:8px;padding:10px 18px;font-size:15px;cursor:pointer">🖨 Друк</button>
  ${hasFax ? `<label style="color:#fff;margin-left:8px;cursor:pointer;user-select:none">
    <input type="checkbox" id="fax-toggle" checked style="width:16px;height:16px;vertical-align:middle;margin-right:6px">
    з факсиміле
  </label>` : ''}
</div>
<style>@media print{.no-print{display:none!important}}</style>`;

const getFacsimileUrls = async (fop) => {
  const out = { stamp: null, sign: null };
  if (!fop) return out;
  const pairs = [];
  if (fop.signaturePath) pairs.push(['sign', fop.signaturePath]);
  if (fop.stampPath)     pairs.push(['stamp', fop.stampPath]);
  for (const [k, p] of pairs) {
    try {
      const { data } = await supabase.storage.from('files').createSignedUrl(p, 3600);
      if (data?.signedUrl) out[k] = data.signedUrl;
    } catch (_) { /* ignore */ }
  }
  return out;
};

export const openPrintWindow = async (html, { fop } = {}) => {
  const fax = await getFacsimileUrls(fop);
  const hasFax = !!(fax.stamp || fax.sign);

  const faxHtml = hasFax ? `
<div id="fax-block" style="position:relative;display:inline-block;min-height:80px">
  ${fax.sign ? `<img src="${fax.sign}" style="max-width:140px;max-height:60px;vertical-align:middle" />` : ''}
  ${fax.stamp ? `<img src="${fax.stamp}" style="max-width:150px;max-height:150px;opacity:0.88;margin-left:-40px;vertical-align:middle" />` : ''}
</div>` : '';

  let processed = html;
  if (hasFax) {
    if (processed.includes('id="fax-slot"')) {
      processed = processed.replace(/<div id="fax-slot"[^>]*>[^<]*<\/div>/, faxHtml);
    } else {
      processed = processed.replace('</body>',
        `<div class="fax-fallback" style="position:fixed;bottom:60px;right:40px">${faxHtml}</div></body>`);
    }
  }

  const bar = buildBar(hasFax);
  const withBar = processed.includes('<body>')
    ? processed.replace('<body>', '<body>' + bar)
    : bar + processed;

  const toggleScript = hasFax ? `
<script>
var t = document.getElementById('fax-toggle');
if (t) t.addEventListener('change', function(e) {
  var blocks = document.querySelectorAll('#fax-block, .fax-fallback');
  blocks.forEach(function(b) { b.style.display = e.target.checked ? '' : 'none'; });
});
</script>` : '';

  const finalHtml = withBar.includes('</body>')
    ? withBar.replace('</body>', toggleScript + '</body>')
    : withBar + toggleScript;

  const w = window.open('', '_blank');
  if (!w) { alert('Дозвольте спливаючі вікна для цього сайту.'); return; }
  w.document.write(finalHtml);
  w.document.close();
};
