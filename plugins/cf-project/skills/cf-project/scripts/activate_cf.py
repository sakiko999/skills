#!/usr/bin/env python3
"""cf-project 激活脚本 —— 把 Cloudflare 开发环境按需装入一个项目(幂等,可重复运行)。

默认做两件事:
  1. 把 4 个 CF MCP 服务器(令牌认证,配置里没有明文密钥)合并进 <root>/.mcp.json
  2. 在项目级启用 cloudflare 插件(覆盖全局的 disabled 状态),
     并预批准这些 MCP 服务器,避免首次连接时的确认弹窗

默认行为:激活时自动把插件自带的 4 个 OAuth 版 MCP 服务器加入禁用名单
  (写入 $CLAUDE_CONFIG_DIR/.claude.json 的 projects[<root>].disabledMcpServers;
   若重启后 /mcp 里仍出现重复的 OAuth 服务器,说明该写法未被识别,
   请改在 /mcp 界面里手动关闭)。

可选:
  --no-plugin          只写 .mcp.json,不启用插件(纯 token 方案,零 OAuth 风险)
  --settings project   把插件启用写进团队共享的 .claude/settings.json(默认个人 settings.local.json)
  --keep-plugin-mcp    不写 OAuth 屏蔽名单(让插件的 4 个 OAuth MCP 正常加载)
  --block-plugin-mcp   已默认开启,保留此参数仅为兼容

MCP 模板来源(按序尝试): $CLAUDE_CONFIG_DIR/.mcp.json → 本技能内置 assets/cloudflare-mcp.json
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

PLUGIN_ID = "cloudflare@claude-plugins-official"
CF_SERVERS = [
    "cloudflare-api",
    "cloudflare-bindings",
    "cloudflare-builds",
    "cloudflare-observability",
]
# 插件自带 MCP 的内部命名空间形式。不要写裸名(如 cloudflare-api),
# 否则会和项目 .mcp.json 里同名的 token 版服务器撞车,把有用的也禁掉。
PLUGIN_MCP_BLOCK = [
    "plugin:cloudflare:cloudflare-api",
    "plugin:cloudflare:cloudflare-bindings",
    "plugin:cloudflare:cloudflare-builds",
    "plugin:cloudflare:cloudflare-observability",
]
SCRIPT_DIR = Path(__file__).resolve().parent


def die(msg):
    print(f"✗ {msg}")
    sys.exit(1)


def config_dir():
    return Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude")


def find_root(arg):
    p = Path(arg or os.getcwd()).resolve()
    if not p.is_dir():
        die(f"目录不存在: {p}")
    r = subprocess.run(
        ["git", "-C", str(p), "rev-parse", "--show-toplevel"],
        capture_output=True, text=True,
    )
    if r.returncode == 0:
        return Path(r.stdout.strip())
    return p


def load_template():
    candidates = [
        config_dir() / ".mcp.json",
        SCRIPT_DIR.parent / "assets" / "cloudflare-mcp.json",
    ]
    for c in candidates:
        try:
            data = json.loads(c.read_text())
            servers = data.get("mcpServers")
            if isinstance(servers, dict) and servers:
                return servers, c
        except Exception:
            continue
    die("找不到 MCP 模板(~/.claude/.mcp.json 与技能内置模板均不可用)")


def read_json(path, what):
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except Exception as e:
        die(f"{what} 不是合法 JSON,请先手工修复,不要让我重建:\n  {path}\n  {e}")


def write_json(path, data):
    # 原子写:先写临时文件再 replace,避免中断把 ~/.claude.json 这类关键文件截断成 0 字节
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    os.replace(tmp, path)


def step_mcp(root, servers):
    f = root / ".mcp.json"
    data = read_json(f, ".mcp.json")
    have = data.setdefault("mcpServers", {})
    added = [n for n in servers if n not in have]
    for n in added:
        have[n] = servers[n]
    write_json(f, data)
    print(f"✓ {f}")
    print(f"    新增: {', '.join(added) if added else '(无,四个服务器均已存在)'}")
    others = sorted(set(have) - set(servers))
    if others:
        print(f"    保留原有: {', '.join(others)}")


def step_plugin(root, enable, team):
    name = "settings.json" if team else "settings.local.json"
    f = root / ".claude" / name
    if not enable:
        print("· 按要求跳过插件启用(--no-plugin,纯 token 方案)")
        return
    data = read_json(f, name)
    ep = data.setdefault("enabledPlugins", {})
    already = ep.get(PLUGIN_ID) is True
    ep[PLUGIN_ID] = True
    em = data.setdefault("enabledMcpjsonServers", [])
    em += [n for n in CF_SERVERS if n not in em]
    write_json(f, data)
    print(f"✓ {f}")
    status = "已是启用状态" if already else "true(项目级覆盖全局 disabled)"
    print(f"    enabledPlugins[{PLUGIN_ID}] = {status}")


def step_gitignore(root):
    gi = root / ".gitignore"
    line = ".claude/settings.local.json"
    if not gi.exists() and not (root / ".git").exists():
        return  # 非 git 项目且无 .gitignore,不必制造文件
    cur = gi.read_text() if gi.exists() else ""
    if line in cur.splitlines():
        return
    with gi.open("a") as fh:
        if cur and not cur.endswith("\n"):
            fh.write("\n")
        fh.write(line + "\n")
    print(f"✓ {gi} 追加忽略 {line}")


def step_block_plugin_mcp(root):
    f = Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home()) / ".claude.json"
    data = read_json(f, str(f))
    proj = data.setdefault("projects", {}).setdefault(str(root), {})
    dm = proj.setdefault("disabledMcpServers", [])
    added = [n for n in PLUGIN_MCP_BLOCK if n not in dm]
    dm += added
    write_json(f, data)
    print(f"✓ {f}")
    print(f"    projects[{root}].disabledMcpServers += {len(added)} 项(插件 OAuth MCP 屏蔽名单)")


def check_token():
    if os.environ.get("CLOUDFLARE_API_TOKEN", "").strip():
        return "环境变量已就绪"
    for c in (
        config_dir() / "settings.json",
        config_dir() / "settings.local.json",
        Path.home() / ".claude" / "settings.json",
    ):
        try:
            v = json.loads(c.read_text()).get("env", {}).get("CLOUDFLARE_API_TOKEN")
            if isinstance(v, str) and v.strip():
                return f"已在 {c} 的 env 中定义"
        except Exception:
            pass
    return None


def main():
    ap = argparse.ArgumentParser(description="把 Cloudflare 开发环境激活到一个项目")
    ap.add_argument("root", nargs="?", default=None, help="项目根目录(默认 git 根,再退回当前目录)")
    ap.add_argument("--no-plugin", action="store_true", help="只写 .mcp.json,不启用插件")
    ap.add_argument("--settings", choices=["local", "project"], default="local",
                    help="插件启用写入 local(个人)还是 project(团队共享)settings")
    ap.add_argument("--keep-plugin-mcp", action="store_true",
                    help="不屏蔽插件自带的 4 个 OAuth 版 MCP 服务器(默认屏蔽)")
    ap.add_argument("--block-plugin-mcp", action="store_true",
                    help="(已默认开启,仅为兼容保留)")
    a = ap.parse_args()

    root = find_root(a.root)
    servers, src = load_template()
    print(f"项目根: {root}")
    print(f"MCP 模板: {src}")
    print("提醒: 本脚本只写配置;生效需重启 claude 会话(结尾有完整说明)")
    print()
    step_mcp(root, servers)
    step_plugin(root, enable=not a.no_plugin, team=(a.settings == "project"))
    if not a.no_plugin:
        step_gitignore(root)
    tok = check_token()
    print(f"CLOUDFLARE_API_TOKEN: {tok or '✗ 未找到!MCP 认证会失败,请先在 ~/.claude/settings.json 的 env 里配置'}")
    if not a.no_plugin and not a.keep_plugin_mcp:
        step_block_plugin_mcp(root)
    print()
    print("⚠️  生效提醒:当前会话【不会】自动生效,必须重启 claude!")
    print("    (实测: /reload-plugins 不会加载新增的项目 .mcp.json,别白跑)")
    print("    1) 退出后重新运行 claude,上下文可用 claude --continue 找回")
    print("    2) 重启后 /mcp 确认 4 个 cloudflare-* 已连接")
    print("    3) 若 OAuth 版 CF 服务器仍重复出现,在 /mcp 里手动 disable 它们")


if __name__ == "__main__":
    main()
