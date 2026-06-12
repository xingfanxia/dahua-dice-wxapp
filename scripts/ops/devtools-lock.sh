#!/bin/bash
# 微信开发者工具互斥锁 —— 多 agent 同机开发小程序的协作约定（铁律 12）。
# 锁 = 目录（mkdir 原子性）：~/.claude/state/wechat-devtools.lock/
# 用法：devtools-lock.sh acquire <project-name>   # 拿锁，被占则打印占用者并退出 1
#       devtools-lock.sh release <project-name>   # 释放（只释放自己的锁）
#       devtools-lock.sh status                   # 看占用
set -euo pipefail
LOCK="$HOME/.claude/state/wechat-devtools.lock"
INFO="$LOCK/owner.json"
STALE_MIN=45  # 超过 45 分钟视为僵尸锁（崩掉的会话），可被抢

cmd="${1:-status}"
proj="${2:-unknown}"

case "$cmd" in
  acquire)
    if mkdir "$LOCK" 2>/dev/null; then
      printf '{"project":"%s","pid":%d,"since":"%s"}\n' "$proj" $$ "$(date -u +%FT%TZ)" > "$INFO"
      echo "LOCKED by $proj"
      exit 0
    fi
    # 已被占：僵尸检测
    if [ -f "$INFO" ]; then
      age_min=$(( ( $(date +%s) - $(stat -f %m "$INFO") ) / 60 ))
      if [ "$age_min" -ge "$STALE_MIN" ]; then
        printf '{"project":"%s","pid":%d,"since":"%s"}\n' "$proj" $$ "$(date -u +%FT%TZ)" > "$INFO"
        echo "STALE lock (${age_min}min) taken over by $proj"
        exit 0
      fi
      echo "BUSY: $(cat "$INFO") (${age_min}min)"
    else
      echo "BUSY: lock exists without owner info"
    fi
    exit 1
    ;;
  release)
    if [ -f "$INFO" ] && grep -q "\"project\":\"$proj\"" "$INFO"; then
      rm -rf "$LOCK"
      echo "RELEASED by $proj"
    elif [ -d "$LOCK" ]; then
      echo "NOT-OWNER: $(cat "$INFO" 2>/dev/null || echo '?') — refusing to release"
      exit 1
    else
      echo "no lock"
    fi
    ;;
  status)
    if [ -d "$LOCK" ]; then
      echo "BUSY: $(cat "$INFO" 2>/dev/null || echo '?')"
    else
      echo "FREE"
    fi
    ;;
  *)
    echo "usage: devtools-lock.sh acquire|release|status [project-name]"
    exit 2
    ;;
esac
