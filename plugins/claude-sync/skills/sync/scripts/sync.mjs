#!/usr/bin/env node
// claude-sync — 用 git 私有仓库同步 ~/.claude 全局配置（Windows/Linux/macOS）。
// 模型：settings.template.json 入库（权威，git 管理合并），
//       settings.json = template + 本机密钥（渲染产物，不入库）。
// 键级三方合并不做，冲突交给 git 在 template 文件上处理 — ponytail: rebase 冲突手动解后重跑 sync。

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const DIR = process.env.CLAUDE_SYNC_DIR || path.join(os.homedir(), '.claude')
const TPL = path.join(DIR, 'settings.template.json')
const LOCAL = path.join(DIR, 'settings.json')
const STAMP = path.join(DIR, '.sync-last-pull') // 每日自动拉取的限频戳

// 密钥/机器相关键：不入库，各机器本地保留。点路径；可在 template 的 _localOnly 里增删。
const DEFAULT_LOCAL_KEYS = [
  'env.ANTHROPIC_BASE_URL',
  'env.ANTHROPIC_AUTH_TOKEN',
  'env.GITHUB_PERSONAL_ACCESS_TOKEN',
  'env.CLOUDFLARE_API_TOKEN',
]

const GITIGNORE = `# claude-sync: 凭证与本机状态不入库
.credentials.json
settings.json
settings.local.json
*.log
.last-cleanup
.ponytail-*
.sync-last-pull
cache/
file-history/
shell-snapshots/
session-env/
paste-cache/
ide/
daemon/
backups/
jobs/
tasks/
sessions/
history.jsonl
statsig/
todos/
# 会话转录（跨机 /resume 需要时删除下一行，注意仓库体积）
projects/
# 插件本体与目录缓存可由 installed_plugins.json 重建，仅同步清单与用户数据
plugins/cache/
plugins/marketplaces/
plugins/plugin-catalog-cache.json
plugins/.last_inuse_sweep
`

const die = (m) => { console.error(`claude-sync: ${m}`); process.exit(1) }
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x)
const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const writeJSON = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n')

function git(...a) {
  try {
    return execFileSync('git', ['-C', DIR, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (e) {
    const err = new Error(`git ${a.join(' ')} 失败\n${e.stderr || e.message}`)
    err.stderr = String(e.stderr || '')
    throw err
  }
}
const tryGit = (...a) => { try { return git(...a) } catch { return null } }

const getIn = (o, dotted) => dotted.split('.').reduce((a, k) => (a == null ? a : a[k]), o)
function setIn(o, dotted, v) {
  const ks = dotted.split('.')
  let c = o
  for (const k of ks.slice(0, -1)) c = c[k] ??= {}
  c[ks.at(-1)] = v
}
function delIn(o, dotted) {
  const ks = dotted.split('.')
  let c = o
  for (const k of ks.slice(0, -1)) { if (!isObj(c?.[k])) return; c = c[k] }
  delete c?.[ks.at(-1)]
}

// over 赢；over 独有键保留；数组/标量整体覆盖
function deepMerge(base, over) {
  if (over === undefined) return base
  if (!isObj(base) || !isObj(over)) return over
  const out = { ...base }
  for (const [k, v] of Object.entries(over)) out[k] = deepMerge(base?.[k], v)
  return out
}

function stripLocal(obj, keys) {
  const c = structuredClone(obj)
  for (const k of keys) delIn(c, k)
  return c
}

// 无 template 时从本机 settings.json 生成（剔除密钥）
function ensureTemplate() {
  if (fs.existsSync(TPL)) return readJSON(TPL)
  if (!fs.existsSync(LOCAL)) die(`未找到 ${LOCAL}，无法生成模板`)
  const tpl = stripLocal(readJSON(LOCAL), DEFAULT_LOCAL_KEYS)
  tpl._localOnly = DEFAULT_LOCAL_KEYS
  writeJSON(TPL, tpl)
  return tpl
}

// template + 本机密钥 → settings.json
function render(tpl, keys, prevLocal) {
  const out = structuredClone(tpl)
  delete out._localOnly
  for (const k of keys) {
    const v = getIn(prevLocal, k)
    if (v !== undefined) setIn(out, k, v)
  }
  return out
}

function init(url) {
  if (!fs.existsSync(path.join(DIR, '.git'))) git('init', '-b', 'main')
  git('config', 'core.autocrlf', 'false')
  tryGit('config', 'credential.helper', '!gh auth git-credential') // gh 认证的机器免配全局 helper
  fs.writeFileSync(path.join(DIR, '.gitignore'), GITIGNORE)
  fs.writeFileSync(path.join(DIR, '.gitattributes'), '* -text\n')
  ensureTemplate()
  git('add', '-A')
  tryGit('commit', '-m', 'claude-sync: init')
  if (url) {
    tryGit('remote', 'remove', 'origin')
    git('remote', 'add', 'origin', url)
  }
  console.log(`init 完成: ${DIR}`)
  console.log(tryGit('remote', 'get-url', 'origin')
    ? '下一步: node sync.mjs sync（首次会创建远端分支并推送）'
    : '下一步: gh repo create dotclaude --private && git remote add origin <url>，然后 node sync.mjs sync')
}

// 新机器导入：远端为准，仅保留本机密钥；settings.json/.credentials.json 永不被覆盖
function adopt(url) {
  if (!url) die('用法: node sync.mjs adopt <repo-url>')
  if (!fs.existsSync(path.join(DIR, '.git'))) git('init', '-b', 'main')
  git('config', 'core.autocrlf', 'false')
  tryGit('remote', 'remove', 'origin')
  git('remote', 'add', 'origin', url)
  git('fetch', 'origin', 'main')
  git('reset', '--soft', 'FETCH_HEAD')
  git('checkout', 'FETCH_HEAD', '--', '.')
  const tpl = readJSON(TPL)
  const keys = tpl._localOnly ?? DEFAULT_LOCAL_KEYS
  const prev = fs.existsSync(LOCAL) ? readJSON(LOCAL) : {}
  writeJSON(LOCAL, render(tpl, keys, prev))
  console.log(`adopt 完成，远端配置已导入（密钥取自本机 ${path.basename(LOCAL)}）`)
  console.log('本机已有的其他未跟踪文件将随下次 sync 进入仓库，请 git status 检查:')
  console.log(git('status', '--short') || '（工作区干净）')
}

// 每日一次的自动拉取（SessionStart hook 调用）：pull + 渲染，不 commit 不 push。
// 任何失败只打一行不抛错——hook 不能打断会话启动。
function pull() {
  try {
    let last = 0
    try { last = fs.statSync(STAMP).mtimeMs } catch {}
    if (Date.now() - last < 86400e3) return
    if (fs.existsSync(path.join(DIR, '.git')) && tryGit('remote', 'get-url', 'origin') && tryGit('ls-remote', 'origin', 'main')) {
      git('pull', '--rebase', 'origin', 'main')
      const tpl = readJSON(TPL)
      const keys = tpl._localOnly ?? DEFAULT_LOCAL_KEYS
      const prev = fs.existsSync(LOCAL) ? readJSON(LOCAL) : {}
      const rendered = render(tpl, keys, prev)
      if (JSON.stringify(rendered) !== JSON.stringify(prev)) {
        writeJSON(LOCAL, rendered)
        console.log('claude-sync: 今日拉取完成，settings.json 已更新')
      }
    }
    fs.writeFileSync(STAMP, '')
  } catch (e) {
    console.error(`claude-sync pull 跳过: ${String(e.stderr || e.message).split('\n')[0].trim()}`)
  }
}

function sync() {
  if (!fs.existsSync(path.join(DIR, '.git'))) die('未初始化，先: node sync.mjs init [repo-url]')
  if (!tryGit('remote', 'get-url', 'origin')) die('未关联远端仓库')

  // 1. 回流：本机 settings.json 剔除密钥 → template（本机改动先 commit，再由 rebase 与远端合并）
  const tpl0 = ensureTemplate()
  const keys0 = tpl0._localOnly ?? DEFAULT_LOCAL_KEYS
  const local0 = fs.existsSync(LOCAL) ? readJSON(LOCAL) : {}
  const upstream = stripLocal(local0, keys0)
  upstream._localOnly = keys0
  if (JSON.stringify(upstream) !== JSON.stringify(tpl0)) writeJSON(TPL, upstream)

  git('add', '-A')
  tryGit('commit', '-m', `claude-sync: ${new Date().toISOString()}`)

  // 2. 远端有内容才 pull（空仓库首推前 pull 会失败）
  if (tryGit('ls-remote', 'origin', 'main')) {
    try {
      git('pull', '--rebase', 'origin', 'main')
    } catch (e) {
      die(`${e.message}\n  template 冲突: 编辑 ${TPL} 解决冲突后 git rebase --continue，再重跑 sync`)
    }
  }

  // 3. 渲染：合并后的 template + 本机密钥 → settings.json
  const tpl1 = readJSON(TPL)
  const keys1 = tpl1._localOnly ?? DEFAULT_LOCAL_KEYS
  const local1 = fs.existsSync(LOCAL) ? readJSON(LOCAL) : {}
  const rendered = render(tpl1, keys1, local1)
  if (JSON.stringify(rendered) !== JSON.stringify(local1)) {
    writeJSON(LOCAL, rendered)
    console.log('settings.json 已更新（远端变更 + 本机密钥保留）')
  }

  // 4. push（-u 幂等）
  tryGit('push', '-u', 'origin', 'main') ?? die('push 失败: 检查远端仓库存在且 token 有写权限')
  console.log('sync 完成')
}

const [cmd, ...rest] = process.argv.slice(2)
try {
  if (cmd === 'init') init(rest[0])
  else if (cmd === 'adopt') adopt(rest[0])
  else if (cmd === 'sync') sync()
  else if (cmd === 'pull') pull()
  else die(`用法: node sync.mjs init [repo-url] | adopt <repo-url> | sync | pull\n  pull = 每日限频的拉取（SessionStart hook 用）；CLAUDE_SYNC_DIR 可覆盖目标目录（默认 ~/.claude）`)
} catch (e) {
  die(e.message)
}
