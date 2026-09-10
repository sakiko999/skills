#!/usr/bin/env node
// 通过 CDP 读取/导航一个页面并导出内容
// 用法:
//   node dump_page.mjs <port> [--url URL] [--text|--html|--screenshot PATH] [--eval 'expr']
// 默认: 当前活动页 innerText
const args = process.argv.slice(2);
const port = args.shift() || 9322;
let url = null, mode = 'text', evalExpr = null, shotPath = null, closeAfter = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--url') url = args[++i];
  else if (args[i] === '--text') mode = 'text';
  else if (args[i] === '--html') mode = 'html';
  else if (args[i] === '--screenshot') { mode = 'shot'; shotPath = args[++i]; }
  else if (args[i] === '--eval') evalExpr = args[++i];
  else if (args[i] === '--new') closeAfter = true;  // 新开页, 看毕关闭, 不污染现有 tab
}
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
let target, isNew = false;
if (url && closeAfter) {
  target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  isNew = true;
} else if (url) {
  // 复用一个已有页面跳转(避免 tab 堆积), URL 通常给 about:blank 页面
  target = list.find(t => t.type === 'page' && t.url === 'about:blank') || list.find(t => t.type === 'page' && !t.url.startsWith('edge://')) || list.find(t => t.type === 'page') || list[0];
  if (!target) { target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json(); isNew = true; }
} else {
  target = list.find(t => t.type === 'page' && !t.url.startsWith('edge://')) || list.find(t => t.type === 'page') || list[0];
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const call = (id, method, params = {}) => new Promise(res => {
  const h = m => { const d = JSON.parse(m.data); if (d.id === id) { ws.removeEventListener('message', h); res(d); } };
  ws.addEventListener('message', h);
  ws.send(JSON.stringify({ id, method, params }));
});
await call(1, 'Page.enable');
await call(2, 'Runtime.enable');
if (url) { await call(3, 'Page.navigate', { url }); await new Promise(r => setTimeout(r, 3000)); }
if (mode === 'shot') {
  const { result } = await call(4, 'Page.captureScreenshot', { format: 'png' });
  const fs = await import('node:fs');
  fs.writeFileSync(shotPath, Buffer.from(result.data, 'base64'));
  console.log(`截图已保存: ${shotPath}`);
  if (isNew) await call(6, 'Page.close');
} else if (evalExpr) {
  const { result } = await call(5, 'Runtime.evaluate', { expression: evalExpr, returnByValue: true });
  console.log(JSON.stringify(result?.result?.value ?? result?.exceptionDetails?.text, null, 2));
} else {
  const expr = mode === 'html'
    ? 'document.documentElement.outerHTML'
    : 'document.body ? document.body.innerText.slice(0, 20000) : "(页面无body)"';
  const { result } = await call(5, 'Runtime.evaluate', { expression: expr, returnByValue: true });
  console.log(result?.result?.value ?? JSON.stringify(result?.exceptionDetails ?? ''));
}
if (isNew) await call(6, 'Page.close');
ws.close();