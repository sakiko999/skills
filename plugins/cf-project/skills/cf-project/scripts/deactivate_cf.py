#!/usr/bin/env python3
"""cf-project 停用脚本 —— 把 activate_cf.py 装进项目的 Cloudflare 环境拆掉(幂等,只做减法)。

做三件事:
  1. 从 <root>/.mcp.json 移除 4 个 CF MCP 服务器;若文件里除了 CF 什么都没有,连文件一起删除
  2. 从 <root>/.claude/settings.local.json 与 settings.json 移除 CF 插件启用与 MCP 预批准;
     文件清理后为空对象则删除(连带的空 .claude/ 目录也一并移除)
  3. 从 $CLAUDE_CONFIG_DIR/.claude.json 的 projects[<root>].disabledMcpServers
     移除当初 --block-plugin-mcp 写入的插件 OAuth 屏蔽名单;条目因此变空则整个移除

有意不做的事:
  - 不动 .gitignore 里的 .claude/settings.local.json 忽略行(该规则对任何用 local
    settings 的项目都成立,不是 CF 专属)
  - 不碰全局配置(全局本来就是禁用状态,停用单个项目无需动它)
  - 项目里其他 MCP 服务器/插件/权限一概保留

用法: deactivate_cf.py [项目根目录]   # 默认: git 根目录,再退回当前目录
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
PLUGIN_MCP_BLOCK = [
    "plugin:cloudflare:cloudflare-api",
    "plugin:cloudflare:cloudflare-bindings",
    "plugin:cloudflare:cloudflare-builds",
    "plugin:cloudflare:cloudflare-observability",
]
SCRIPT_DIR = Path(__file__).resolve().parent


def expected_template():
    """内置模板(单一事实源),用于区分 CF 官方条目与用户自建的同名服务器"""
    try:
        d = json.loads((SCRIPT_DIR.parent / "assets" / "cloudflare-mcp.json").read_text())
        s = d.get("mcpServers")
        if isinstance(s, dict) and s:
            return s
    except Exception:
        pass
    return {}


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


def step_mcp(root):
    f = root / ".mcp.json"
    if not f.exists():
        print("· 无 .mcp.json,跳过")
        return False
    data = read_json(f, ".mcp.json")
    servers = data.get("mcpServers", {})
    tmpl = expected_template()
    removed, keep_warn = [], []
    for n in CF_SERVERS:
        if n not in servers:
            continue
        if tmpl and tmpl.get(n) != servers[n]:
            keep_warn.append(n)  # 同名但配置不同 → 用户自己的服务器
            continue
        del servers[n]
        removed.append(n)
    if keep_warn:
        print(f"⚠ 同名但配置不同的服务器视为自有配置,已保留: {', '.join(keep_warn)}")
    if not removed:
        if not keep_warn:
            print(f"· {f} 里没有 CF 服务器,保持原样")
        return False
    others = sorted(servers)
    other_keys = [k for k in data if k != "mcpServers"]
    if not others and not other_keys:
        f.unlink()
        print(f"✓ 已删除 {f}(里面只有 CF 服务器)")
    elif not others:
        del data["mcpServers"]
        write_json(f, data)
        print(f"✓ {f} 移除 {len(removed)} 个 CF 服务器(文件保留,含其他配置)")
    else:
        write_json(f, data)
        print(f"✓ {f} 移除 {', '.join(removed)};保留原有: {', '.join(others)}")
    return True


def step_settings(root):
    changed_any = False
    for name in ("settings.local.json", "settings.json"):
        f = root / ".claude" / name
        if not f.exists():
            continue
        data = read_json(f, name)
        changed = False
        ep = data.get("enabledPlugins")
        if isinstance(ep, dict):
            if PLUGIN_ID in ep:
                del ep[PLUGIN_ID]
                changed = True
            if not ep and "enabledPlugins" in data:
                del data["enabledPlugins"]
        em = data.get("enabledMcpjsonServers")
        if isinstance(em, list):
            kept = [n for n in em if n not in CF_SERVERS]
            if kept != em:
                changed = True
            if kept:
                data["enabledMcpjsonServers"] = kept
            elif "enabledMcpjsonServers" in data:
                del data["enabledMcpjsonServers"]
        if not changed:
            print(f"· {f} 无 CF 相关内容")
            continue
        if data == {}:
            f.unlink()
            try:
                f.parent.rmdir()  # .claude/ 空了就连目录一起收掉
            except OSError:
                pass
            print(f"✓ 已删除 {f}(清理后无其他内容)")
        else:
            write_json(f, data)
            print(f"✓ {f} 移除 CF 插件启用与 MCP 预批准(其余保留)")
        changed_any = True
    return changed_any


def step_block(root):
    f = Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home()) / ".claude.json"
    if not f.exists():
        return False
    data = read_json(f, str(f))
    proj = data.get("projects", {}).get(str(root))
    if not isinstance(proj, dict) or "disabledMcpServers" not in proj:
        return False
    dm = proj["disabledMcpServers"]
    kept = [n for n in dm if n not in PLUGIN_MCP_BLOCK]
    removed = len(dm) - len(kept)
    if not removed:
        return False
    if kept:
        proj["disabledMcpServers"] = kept
    else:
        del proj["disabledMcpServers"]
        if not proj:
            del data["projects"][str(root)]
    write_json(f, data)
    print(f"✓ {f} 移除 {removed} 项插件 OAuth MCP 屏蔽名单")
    print("    注意:该文件会被正在运行的会话重写,若屏蔽名单复活属正常,可再跑一次本脚本")
    return True


def main():
    ap = argparse.ArgumentParser(description="把 Cloudflare 开发环境从项目里停用移除")
    ap.add_argument("root", nargs="?", default=None, help="项目根目录(默认 git 根,再退回当前目录)")
    a = ap.parse_args()

    root = find_root(a.root)
    print(f"项目根: {root}\n")
    touched = step_mcp(root)
    touched = step_settings(root) or touched
    touched = step_block(root) or touched
    print()
    if not touched:
        print("该项目本来就没有 CF 配置,无需停用。")
        return
    print()
    print("⚠️  生效提醒:当前会话【不会】自动生效,必须重启 claude!")
    print("    (实测: /reload-plugins 不会重扫项目 .mcp.json,别白跑)")
    print("    1) 退出后重新运行 claude,上下文可用 claude --continue 找回")
    print("    2) 重启后 /mcp 确认 4 个 cloudflare-* 服务器已消失")
    print("    3) .gitignore 里的 settings.local.json 忽略行有意保留(非 CF 专属)")


if __name__ == "__main__":
    main()
