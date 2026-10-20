// Shared by repository setup and the bundled installer. Launching this wrapper
// never grants permission to interrupt an existing Codex process.
const codexBinary = "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT";
const shellQuote = value => `'${String(value).replaceAll("'", "'\\''")}'`;
const codexProcessPattern = `^${codexBinary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([[:space:]]|$)`;

export const bridgeLauncher = `#!/bin/zsh
set -u
unsetopt BG_NICE

codex_binary=${shellQuote(codexBinary)}
codex_process_pattern=${shellQuote(codexProcessPattern)}
bridge_log="$HOME/Library/Logs/OpenCodexMicro-codex-bridge.log"

if [[ ! -x "$codex_binary" ]]; then
  /usr/bin/osascript -e 'display alert "Codex Bridge" message "Codex was not found at /Applications/ChatGPT.app.\\n未找到 /Applications/ChatGPT.app。" as critical'
  exit 1
fi

# macOS pgrep otherwise excludes ancestors, including Codex when the wrapper
# is invoked from a terminal or automation hosted by that same application.
/usr/bin/pgrep -a -f "$codex_process_pattern" >/dev/null 2>&1
codex_process_status=$?
if [[ "$codex_process_status" -eq 0 ]]; then
  /usr/bin/osascript -e 'display alert "Codex Bridge" message "Codex is already running. No action was taken. If Bridge is connected, keep using it. Otherwise finish active tasks, quit Codex yourself, then open Codex Bridge again.\\nCodex 已在运行，启动器未进行任何操作。如果 Bridge 已连接，可继续使用；否则请完成任务后手动退出 Codex，再打开 Codex Bridge。"'
  exit 1
fi
if [[ "$codex_process_status" -ne 1 ]]; then
  /usr/bin/osascript -e 'display alert "Codex Bridge" message "The running Codex state could not be verified. No application was started or stopped.\\n无法确认 Codex 运行状态，未启动或停止任何应用。" as critical'
  exit 1
fi

/usr/bin/nohup "$codex_binary" \\
  --remote-debugging-address=127.0.0.1 \\
  --remote-debugging-port=9222 \\
  --remote-allow-origins=http://127.0.0.1:9222 \\
  >>"$bridge_log" 2>&1 &

# A bounded readiness check only: failure never retries the application launch.
for attempt in {1..300}; do
  if /usr/bin/curl --noproxy '*' --silent --fail --max-time 0.2 \\
    http://127.0.0.1:9222/json/version >/dev/null 2>&1; then
    exit 0
  fi
  if ! /usr/bin/pgrep -a -f "$codex_process_pattern" >/dev/null 2>&1; then
    break
  fi
  /bin/sleep 0.1
done

/usr/bin/osascript -e 'display alert "Codex Bridge" message "Codex was launched once, but its Bridge endpoint is unavailable. No restart was attempted. Finish active tasks and quit Codex yourself before trying again.\\nCodex 已启动一次，但 Bridge 连接不可用，未尝试重启。重试前请完成任务并手动退出 Codex。" as critical'
exit 1
`;
