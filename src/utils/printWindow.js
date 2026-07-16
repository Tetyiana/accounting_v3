// Друк HTML у новому вікні з кнопкою повернення (критично для смартфонів:
// нова вкладка перекриває додаток, і без кнопки не повернутись у меню).
export const openPrintWindow = (html) => {
  const backBtn = `
<div class="no-print" style="position:sticky;top:0;background:#0d3b33;padding:10px 14px;z-index:999;display:flex;gap:10px">
  <button onclick="window.close()" style="background:#fff;border:none;border-radius:8px;padding:10px 18px;font-size:15px;cursor:pointer">← Закрити</button>
  <button onclick="window.print()" style="background:#4ade80;border:none;border-radius:8px;padding:10px 18px;font-size:15px;cursor:pointer">🖨 Друк</button>
</div>
<style>@media print{.no-print{display:none!important}}</style>`;

  // кнопки одразу після <body>, авто-друк лишаємо якщо був у шаблоні
  const withBtn = html.includes('<body>')
    ? html.replace('<body>', '<body>' + backBtn)
    : backBtn + html;

  const w = window.open('', '_blank');
  if (!w) { alert('Дозвольте спливаючі вікна для цього сайту.'); return; }
  w.document.write(withBtn);
  w.document.close();
};
