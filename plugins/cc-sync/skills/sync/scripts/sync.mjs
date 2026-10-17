#!/usr/bin/env node
// cc-sync — 用 git 私有仓库同步 ~/.claude 全局配置（Windows/Linux/macOS）。
// 模型：settings.template.json 入库（共享基线）；各机 settings.json = 三方合并结果 + 本机密钥。
// 冲突策略：settings 走 JSON 三方合并（git merge-base 作基线，本机值优先），
//           其余共享文件走 git 常规合并。plans/ 与运行时缓存属机器本地，不入库。
//
// ponytail: 只在 settings 上做键级三方合并；共享文本（CLAUDE.md 等）真冲突时仍交给 git。

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const DIR = process.env.CLAUDE_SYNC_DIR || path.join(os.homedir(), '.claude')
const TPL = path.join(DIR, 'settings.template.json')
const LOCAL = path.join(DIR, 'settings.json')
const STAMP = path.join(DIR, '.sync-last-pull') // 每日自动拉取的限频戳
const IGNORE = path.join(DIR, '.gitignore')
const ATTR = path.join(DIR, '.gitattributes')
const SELF = path.resolve(process.argv[1]).replace(/\\/g, '/')

// 密钥/机器相关键：不入库，各机器本地保留。点路径；可在 template 的 _localOnly 里增删。
// GITHUB/CF token 已随 settings.template.json 入库分发（跨 Windows/Linux 分发用），故不在此处默认剔除。
const DEFAULT_LOCAL_KEYS = [
  'env.ANTHROPIC_BASE_URL',
  'env.ANTHROPIC_AUTH_TOKEN',
]

const GITIGNORE = `# cc-sync: 凭证与本机状态不入库
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
context-recall/
statsig/
todos/
# 会话转录与项目级 memory（slug 按本机路径生成，跨机路径不同则读不到）均不同步
projects/
# 插件本体与目录缓存可由 installed_plugins.json 重建，仅同步清单与用户数据
# installed_plugins.json 是 Claude Code 本体自动维护的安装状态（半装残留/插件自更新会改它），
# 同步它不是"同步配置"，而是把跨机互推的状态当配置入库——各机以模板+manual 脚本为准重建
plugins/cache/
plugins/marketplaces/
plugins/plugin-catalog-cache.json
plugins/plugin-directory-cache-v2.json
plugins/.last_inuse_sweep
plugins/installed_plugins.json
debug/
stats-cache.json

# 本机路径(installLocation)属机器本地，各机自修正，不入库
plugins/known_marketplaces.json

# 机器本地：会话计划、运行时缓存、开发中的 mod 源码；跨机同步只会互相删除
plans/
mcp-needs-auth-cache.json
dev-mods/`

const ATTR_LINES = ['* -text', 'settings.template.json merge=ccsync-json']

const die = (m) => { console.error(`cc-sync: ${m}`); process.exit(1) }
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

function equal(a, b) {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null) return false
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((v, i) => equal(v, b[i]))
  }
  if (isObj(a)) {
    if (!isObj(b)) return false
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    return ka.length === kb.length && ka.every(k => equal(a[k], b[k]))
  }
  return false
}

// over 赢；over 独有键保留；数组/标量整体覆盖
function deepMerge(base, over) {
  if (over === undefined) return base
  if (!isObj(base) || !isObj(over)) return over
  const out = { ...base }
  for (const [k, v] of Object.entries(over)) out[k] = deepMerge(base?.[k], v)
  return out
}

// 三方合并：只有一边变了就取变的那边；两边都变则保留本机值并记下键路径。
// prefer='theirs' 用于 rebase：此时 %A 是上游、%B 才是本机提交，不能让上游赢。
function merge3(base, ours, theirs, at = '', conflicts = [], prefer = 'ours') {
  if (equal(ours, theirs)) return ours
  if (equal(ours, base)) return theirs
  if (equal(theirs, base)) return ours

  if (isObj(ours) && isObj(theirs)) {
    const out = {}
    const keys = new Set([
      ...(isObj(base) ? Object.keys(base) : []),
      ...Object.keys(ours),
      ...Object.keys(theirs),
    ])
    for (const k of keys) {
      const v = merge3(isObj(base) ? base[k] : undefined, ours[k], theirs[k], at ? `${at}.${k}` : k, conflicts, prefer)
      if (v !== undefined) out[k] = v
    }
    return out
  }

  conflicts.push(at || '(root)')
  return prefer === 'theirs' ? theirs : ours
}

function stripLocal(obj, keys) {
  const c = structuredClone(obj)
  for (const k of keys) delIn(c, k)
  return c
}

function ensureFileLines(file, lines) {
  const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const have = new Set(old.split(/\r?\n/).map(l => l.trim()))
  const missing = lines.filter(l => !have.has(l.trim()))
  if (missing.length === 0) return
  fs.writeFileSync(file, (old ? old.replace(/\s*$/, '') + '\n' : '') + missing.join('\n') + '\n')
}

function configureMergeDriver() {
  tryGit('config', 'merge.ccsync-json.name', 'cc-sync JSON merge')
  tryGit('config', 'merge.ccsync-json.driver', `node "${SELF}" merge-driver %O %A %B`)
}

// 一次性迁移：补齐 ignore/attributes、注册 JSON 合并驱动、停止跟踪机器本地文件（文件保留）。
function migrate() {
  if (!fs.existsSync(path.join(DIR, '.git'))) return
  ensureFileLines(IGNORE, GITIGNORE.split('\n'))
  ensureFileLines(ATTR, ATTR_LINES)
  configureMergeDriver()

  for (const p of ['plans', 'mcp-needs-auth-cache.json', 'plugins/plugin-directory-cache-v2.json']) {
    tryGit('rm', '-r', '--cached', '--ignore-unmatch', '--quiet', p)
  }
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

// 远端 main 上的 template；不可达时返回 null。
function remoteTemplate() {
  if (!tryGit('remote', 'get-url', 'origin')) return null
  if (!tryGit('ls-remote', 'origin', 'main')) return null
  git('fetch', 'origin', 'main')
  const raw = tryGit('show', 'FETCH_HEAD:settings.template.json')
  return raw === null ? null : JSON.parse(raw)
}

// 用 git 的公共祖先 template 作为三方基线（不是本机 template——本机 template 可能落后）。
function baseTemplate() {
  const mb = tryGit('merge-base', 'HEAD', 'FETCH_HEAD')
  if (!mb) return null
  const raw = tryGit('show', `${mb}:settings.template.json`)
  if (raw === null) return null
  try { return JSON.parse(raw) } catch { return null }
}

function mergeSettings(remoteTpl) {
  const localTpl = fs.existsSync(TPL) ? readJSON(TPL) : {}
  const keys = remoteTpl?._localOnly ?? localTpl._localOnly ?? DEFAULT_LOCAL_KEYS
  const prev = fs.existsSync(LOCAL) ? readJSON(LOCAL) : {}
  const ours = stripLocal(prev, keys)
  const base = remoteTpl === null ? ours : (baseTemplate() ?? {})
  const conflicts = []
  const merged = merge3(base, ours, remoteTpl ?? ours, '', conflicts)
  // settings.json 没有 _localOnly，合并时会被当成"本机删除了它"，这里补回共享定义。
  merged._localOnly = remoteTpl?._localOnly ?? localTpl._localOnly ?? DEFAULT_LOCAL_KEYS

  if (conflicts.length > 0) {
    console.log(`cc-sync: settings 有 ${conflicts.length} 个键两侧都改过，保留本机值: ${conflicts.slice(0, 6).join(', ')}`)
  }
  return { merged, keys, prev }
}

function init(url) {
  if (!fs.existsSync(path.join(DIR, '.git'))) git('init', '-b', 'main')
  git('config', 'core.autocrlf', 'false')
  tryGit('config', 'credential.helper', '!gh auth git-credential') // gh 认证的机器免配全局 helper
  migrate()
  ensureTemplate()
  git('add', '-A')
  tryGit('commit', '-m', 'cc-sync: init')
  if (url) {
    tryGit('remote', 'remove', 'origin')
    git('remote', 'add', 'origin', url)
  }
  console.log(`init 完成: ${DIR}`)
  console.log(tryGit('remote', 'get-url', 'origin')
    ? '下一步: node sync.mjs push（首次会创建远端分支并推送）'
    : '下一步: gh repo create dotclaude --private && git remote add origin <url>，然后 node sync.mjs push')
}

// 新机器导入：远端为准，仅保留本机密钥；settings.json/.credentials.json 永不被覆盖
function adopt(url) {
  if (!url) die('用法: node sync.mjs adopt <repo-url>')
  if (!fs.existsSync(path.join(DIR, '.git'))) git('init', '-b', 'main')
  git('config', 'core.autocrlf', 'false')
  tryGit('remote', 'remove', 'origin')
  git('remote', 'add', 'origin', url)
  git('fetch', 'origin', 'main')
  git('reset', 'FETCH_HEAD') // mixed：index=远端，避免老机器 re-adopt 时复活远端已删文件
  git('checkout', 'FETCH_HEAD', '--', '.')
  migrate()
  const tpl = readJSON(TPL)
  const keys = tpl._localOnly ?? DEFAULT_LOCAL_KEYS
  const prev = fs.existsSync(LOCAL) ? readJSON(LOCAL) : {}
  writeJSON(LOCAL, render(tpl, keys, prev))
  console.log(`adopt 完成，远端配置已导入（密钥取自本机 ${path.basename(LOCAL)}）`)
  console.log('本机已有的其他未跟踪文件将随下次 push 进入仓库，请 git status 检查:')
  console.log(git('status', '--short') || '（工作区干净）')
}

// 每日一次的自动拉取（SessionStart hook 调用）：fetch + 三方合并 settings → settings.json。
// 不 commit、不 push；本机未推送的 settings 改动会保留。
// 任何失败只打一行不抛错——hook 不能打断会话启动。
function pull(force) {
  try {
    let last = 0
    try { last = fs.statSync(STAMP).mtimeMs } catch {}
    if (!force && Date.now() - last < 86400e3) return
    if (!fs.existsSync(path.join(DIR, '.git'))) return
    if (!tryGit('remote', 'get-url', 'origin')) return
    if (!tryGit('ls-remote', 'origin', 'main')) {
      console.log(`cc-sync: 远端不可达，跳过拉取（下次会话重试，${new Date().toLocaleString()}）`)
      return // 不写限频戳，网络恢复后重试
    }
    applyRemote()
    console.log(`cc-sync: 拉取完成（${new Date().toLocaleString()}）`)
    fs.writeFileSync(STAMP, '')
  } catch (e) {
    const head = `cc-sync: 拉取（${new Date().toLocaleString()}）`
    const line = String(e.stderr || e.message).split('\n').find(l => /CONFLICT|error|fatal|not/i.test(l))?.trim()
    console.log(`${head} 失败: ${line || 'git 异常'}`)
  }
}

// 远端 template 为共享基线，与本地 settings 做三方合并后重建 settings.json。
// 同时把远端意图文件（.claude-sync/）同步到工作区。
const INTENT_DIR = '.claude-sync'
function applyRemote() {
  git('fetch', 'origin', 'main')
  try { git('checkout', 'FETCH_HEAD', '--', INTENT_DIR) }
  catch (e) { console.log(`cc-sync: 意图目录 ${INTENT_DIR} 同步失败：${String(e.stderr || e.message).split('\n')[0]}`) }

  const raw = git('show', 'FETCH_HEAD:settings.template.json')
  const remoteTpl = JSON.parse(raw)
  const { merged, keys, prev } = mergeSettings(remoteTpl)
  const rendered = render(merged, keys, prev)

  if (!equal(rendered, prev)) {
    writeJSON(LOCAL, rendered)
    console.log('settings.json 已更新（远端 template 与本地改动三方合并）')
  }
}

// 手动推送：本地 settings 三方合并进 template，commit，rebase 远端，push。
// 只在"本机改了想分享的配置"时手动跑；其余机器只 pull。
function push() {
  if (!fs.existsSync(path.join(DIR, '.git'))) die('未初始化，先: node sync.mjs init [repo-url]')
  if (!tryGit('remote', 'get-url', 'origin')) die('未关联远端仓库')

  migrate()
  const remoteTpl = remoteTemplate()
  const { merged } = mergeSettings(remoteTpl)
  writeJSON(TPL, merged)

  git('add', '-A')
  tryGit('commit', '-m', `cc-sync: ${new Date().toISOString()}`)

  if (remoteTpl !== null) {
    try {
      git('pull', '--rebase', '--autostash', 'origin', 'main')
    } catch (e) {
      die(`${e.message}\n  settings.template.json 已由 JSON 合并驱动自动处理；其他文件冲突请手动解决后 git rebase --continue，再跑 push`)
    }
  }

  tryGit('push', '-u', 'origin', 'main') ?? die('push 失败: 检查远端仓库存在且 token 有写权限')
  console.log('已推送远端（settings 三方合并，本机值优先）')
}

function isRebasing() {
  const gd = tryGit('rev-parse', '--git-dir')
  if (!gd) return false
  const abs = path.isAbsolute(gd) ? gd : path.join(DIR, gd)
  return fs.existsSync(path.join(abs, 'rebase-merge')) || fs.existsSync(path.join(abs, 'rebase-apply'))
}

// git 合并驱动：%O 基线 / %A 当前分支 / %B 被合入的提交；结果写回 %A，永不产生冲突标记。
// rebase 时 %A 是上游、%B 才是本机提交，因此冲突时改取 %B。
function mergeDriver([baseFile, oursFile, theirsFile]) {
  const read = (p) => { try { return readJSON(p) } catch { return {} } }
  const conflicts = []
  const prefer = isRebasing() ? 'theirs' : 'ours'
  const merged = merge3(read(baseFile), read(oursFile), read(theirsFile), '', conflicts, prefer)
  writeJSON(oursFile, merged)
  if (conflicts.length > 0) {
    console.error(`cc-sync: merge-driver 保留本机值: ${conflicts.slice(0, 6).join(', ')}`)
  }
}

const [cmd, ...rest] = process.argv.slice(2)
try {
  if (cmd === 'init') init(rest[0])
  else if (cmd === 'adopt') adopt(rest[0])
  else if (cmd === 'push') push()
  else if (cmd === 'pull') pull(rest.includes('--force'))
  else if (cmd === 'merge-driver') mergeDriver(rest)
  else die(`用法: node sync.mjs init [repo-url] | adopt <repo-url> | push | pull [--force]\n  pull = 每日限频的只读拉取（SessionStart hook 用）；CLAUDE_SYNC_DIR 可覆盖目标目录（默认 ~/.claude）`)
} catch (e) {
  die(e.message)
}
