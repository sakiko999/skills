// 两机模拟：node sync.test.mjs [sync.mjs 路径]
// 用一个临时 bare 仓库验证 push/pull 的三方合并、密钥隔离、rebase 冲突和 plans 不入库。
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const SCRIPT = process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'sync.mjs')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsync-test-'))
const remote = path.join(root, 'remote.git')
const A = path.join(root, 'a')
const B = path.join(root, 'b')

const run = (cwd, cmd, args, env = {}) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, CLAUDE_SYNC_DIR: cwd, ...env } }).trim()
const sync = (dir, ...args) => run(dir, process.execPath, [SCRIPT, ...args])
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const write = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n')
const remoteTpl = () => JSON.parse(run(root, 'git', ['-C', remote, 'show', 'main:settings.template.json']))

function prep(dir) {
  fs.mkdirSync(dir, { recursive: true })
  run(dir, 'git', ['config', 'user.email', 'test@example.com'])
  run(dir, 'git', ['config', 'user.name', 'cc-sync test'])
}
const seed = (dir) => write(path.join(dir, 'settings.json'), {
  env: { ANTHROPIC_AUTH_TOKEN: `secret-${path.basename(dir)}`, FOO: 'a' },
  model: 'base',
  permissions: { allow: ['x'] },
})

try {
  run(root, 'git', ['init', '--bare', '-b', 'main', remote])

  // A: 初始化并首次推送
  fs.mkdirSync(A, { recursive: true })
  seed(A)
  sync(A, 'init', remote)
  prep(A)
  sync(A, 'push')

  let tpl = remoteTpl()
  assert.equal(tpl.env.FOO, 'a')
  assert.equal(tpl.env.ANTHROPIC_AUTH_TOKEN, undefined, 'secret must not enter template')
  assert.deepEqual(tpl._localOnly, ['env.ANTHROPIC_BASE_URL', 'env.ANTHROPIC_AUTH_TOKEN'])

  // B: adopt 后改自己的设置并推送
  fs.mkdirSync(B, { recursive: true })
  sync(B, 'adopt', remote)
  prep(B)
  const b0 = read(path.join(B, 'settings.json'))
  b0.env.ANTHROPIC_AUTH_TOKEN = 'secret-b'
  b0.env.B = 'b'
  b0.model = 'b-model'
  write(path.join(B, 'settings.json'), b0)
  sync(B, 'push')

  // A: 改另一个键并推送 —— 应保留 B 的改动
  const a0 = read(path.join(A, 'settings.json'))
  a0.env.A = 'a'
  a0.permissions.allow.push('y')
  write(path.join(A, 'settings.json'), a0)
  sync(A, 'push')

  tpl = remoteTpl()
  assert.equal(tpl.model, 'b-model', 'B model survives A push')
  assert.deepEqual(tpl.permissions.allow, ['x', 'y'])
  assert.equal(tpl.env.B, 'b')
  assert.equal(tpl.env.A, 'a')
  assert.equal(tpl.env.ANTHROPIC_AUTH_TOKEN, undefined)

  // B: pull 应拿到 A 的 permissions，同时保住自己的密钥和 model
  sync(B, 'pull', '--force')
  const b1 = read(path.join(B, 'settings.json'))
  assert.deepEqual(b1.permissions.allow, ['x', 'y'])
  assert.equal(b1.model, 'b-model')
  assert.equal(b1.env.ANTHROPIC_AUTH_TOKEN, 'secret-b')

  // 同一个键两边都改：B 先推，A 后推，A 不应因 git 冲突失败，且本机值优先
  const b2 = read(path.join(B, 'settings.json'))
  b2.model = 'b2'
  write(path.join(B, 'settings.json'), b2)
  sync(B, 'push')

  const a1 = read(path.join(A, 'settings.json'))
  a1.model = 'a2'
  write(path.join(A, 'settings.json'), a1)
  sync(A, 'push')
  assert.equal(remoteTpl().model, 'a2', 'local wins on true conflict, no git conflict')

  // B 再 pull，应采纳 A 的 a2（B 自上次 push 后没再改 model）
  sync(B, 'pull', '--force')
  assert.equal(read(path.join(B, 'settings.json')).model, 'a2')

  // 机器本地 plans/ 不入库，但文件仍在磁盘
  fs.mkdirSync(path.join(A, 'plans'), { recursive: true })
  fs.writeFileSync(path.join(A, 'plans', 'p.md'), 'local plan\n')
  sync(A, 'push')
  const tree = run(root, 'git', ['-C', remote, 'ls-tree', '-r', '--name-only', 'main']).split('\n')
  assert.ok(!tree.some(p => p.startsWith('plans/')), 'plans must not be tracked')
  assert.ok(fs.existsSync(path.join(A, 'plans', 'p.md')))

  // 合并驱动已注册
  assert.match(run(A, 'git', ['config', '--get', 'merge.ccsync-json.driver']), /merge-driver/)
  assert.match(fs.readFileSync(path.join(A, '.gitattributes'), 'utf8'), /settings\.template\.json merge=ccsync-json/)

  console.log('all sync tests passed')
  fs.rmSync(root, { recursive: true, force: true })
} catch (e) {
  console.error('TEST FAILED; temp dir kept at', root)
  console.error(e.message)
  process.exit(1)
}
