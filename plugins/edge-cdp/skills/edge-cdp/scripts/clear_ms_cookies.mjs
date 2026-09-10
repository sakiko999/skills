#!/usr/bin/env node
// 清掉 Edge CDP 实例上微软残留账户 cookie（msn.com / bing.com 等）
// 实测：启动全新 profile 后，Edge 仍会动态种入一组 .msn.com/.bing.com 登录 cookie。
//       默认 flag 清不掉；唯一可靠方式是在实例内用 CDP Storage.clearCookies() 删除。
// 用法: node clear_ms_cookies.mjs [port]   (默认 9322)
const port = process.argv[2] || 9322;
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find(t => t.type === 'page') || list[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const call = (id, method, params = {}) => new Promise(res => {
  const h = m => { const d = JSON.parse(m.data); if (d.id === id) { ws.removeEventListener('message', h); res(d); } };
  ws.addEventListener('message', h);
  ws.send(JSON.stringify({ id, method, params }));
});
await call(1, 'Network.enable');
const before = await call(2, 'Network.getAllCookies');
const total = before?.result?.cookies?.length || 0;
// 针对性删 msn/bing
for (const dom of ['.msn.com', '.bing.com', 'www.bing.com']) {
  await call(3, 'Network.deleteCookies', { name: '*', url: `https://${dom}` });
}
// 整仓清空兜底
await call(4, 'Storage.clearCookies');
const after = await call(5, 'Network.getAllCookies');
const remain = after?.result?.cookies?.length || 0;
console.log(`cookie 清理: ${total} -> ${remain}`);
ws.close();