#!/usr/bin/env bash
# 启动一个干净的 Edge CDP 实例（Windows 侧 msedge.exe，供 WSL/Linux 通过 CDP 调试）
# 用法:
#   launch_clean_edge.sh [--port 9322] [--keep] [--headless] [--clear-cookies]
# 默认: 端口 9322, 全新建 profile 目录, 输出 CDP webSocketDebuggerUrl
set -uo pipefail

# ---- 默认值 ----
PORT="${EDGE_CDP_PORT:-9322}"
MODE="clean"          # 默认清干净再起
HEADLESS=0
CLEAR_COOKIES=0
EDGE_BIN="${EDGE_BIN:-/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe}"
DATA_DIR="${EDGE_CDP_DATA_DIR:-/mnt/c/temp/edge-cdp-clean}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2;;
    --headless) HEADLESS=1; shift;;
    --clear-cookies) CLEAR_COOKIES=1; shift;;
    --keep) MODE="keep"; shift;;   # 保留现有 profile 目录(不删), 适合复用登录态
    *) echo "未知参数: $1"; exit 2;;
  esac
done

WINDOWS_DATA=$(wslpath -w "$DATA_DIR")

# ---- 1. 杀干净旧 Edge（单例会吞参数,必须等它真正退出） ----
/mnt/c/Windows/System32/taskkill.exe /F /T /IM msedge.exe >/dev/null 2>&1
# 轮询等 msedge 进程彻底消失（最长 15s），避免新参数被旧实例吞掉
for i in $(seq 1 30); do
  if ! /mnt/c/Windows/System32/tasklist.exe 2>/dev/null | grep -qi "msedge.exe"; then break; fi
  sleep 0.5
done

# ---- 2. 重建 profile 目录 ----
if [[ "$MODE" == "clean" ]]; then
  rm -rf "$DATA_DIR"
  mkdir -p "$DATA_DIR"
fi

# ---- 3. 组装参数 ----
FLAGS=(
  --remote-debugging-port="$PORT"
  --user-data-dir="$WINDOWS_DATA"
  --no-first-run
  --no-default-browser-check
  --disable-extensions
  --disable-sync
  --disable-default-apps
  --edge-redirect-feed-at-first-run-disabled=1
)
[[ $HEADLESS -eq 1 ]] && FLAGS+=(--headless=new)

# ---- 4. 启动 ----
"$EDGE_BIN" "${FLAGS[@]}" about:blank >/dev/null 2>&1 &

# ---- 5. 等端口就绪（最长 20s） ----
PORT_READY=0
for i in $(seq 1 40); do
  if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/json/version" 2>/dev/null | grep -q 200; then PORT_READY=1; break; fi
  sleep 0.5
done
if [[ $PORT_READY -ne 1 ]]; then
  echo "错误: Edge CDP 端口 $PORT 未在 20s 内就绪（可能 Edge 启动失败或端口被占用）"
  exit 1
fi

WS=$(curl -s "http://127.0.0.1:$PORT/json/version" | python3 -c 'import sys,json;print(json.load(sys.stdin)["webSocketDebuggerUrl"])' 2>/dev/null)

# ---- 6. 清微软残留 cookie (可选) ----
if [[ $CLEAR_COOKIES -eq 1 ]]; then
  node "$(dirname "$0")/clear_ms_cookies.mjs" "$PORT"
fi

echo "CDP 端口: $PORT"
echo "数据目录: $DATA_DIR"
echo "WebSocket: $WS"
echo "调试 URL: http://127.0.0.1:$PORT"