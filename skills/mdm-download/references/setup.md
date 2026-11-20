# MDM setup and discovery

## Locate the programs

`misterdownloadmanager-mcp` and `misterdownloadmanager-cli` sit next to the app:

| Install | Folder |
|---|---|
| Windows, current user (default) | `%LOCALAPPDATA%\Programs\Mister Download Manager\` |
| Windows, all users | `C:\Program Files\Mister Download Manager\` |
| Windows, zip or portable | the extracted folder |
| macOS | `/Applications/Mister Download Manager.app/Contents/MacOS/` |
| Linux, .deb/.rpm | `/usr/bin/` |
| Linux, .tar.gz | the extracted folder; the AppImage does not ship the MCP server |

Windows executables end in `.exe`. Search the usual install locations and `PATH`
before concluding MDM is absent. A portable build's MCP server finds that portable
app from its own folder.

## Turn on the automation API

The API is off by default and is needed to list or act on the running app's downloads:

```text
misterdownloadmanager-cli api on
```

MDM must be running. It stays on across restarts; `api off` disables it. Adding a
download through the app's command line or MCP `add_download` does not require the API.

## Configure the MCP server in Codex

Register the server once, using the absolute path found above, then restart Codex:

```text
codex mcp add misterdownloadmanager -- "<path to misterdownloadmanager-mcp>"
```

For the default Windows per-user install:

```text
codex mcp add misterdownloadmanager -- "C:\Users\<you>\AppData\Local\Programs\Mister Download Manager\misterdownloadmanager-mcp.exe"
```

Verify with `codex mcp list` and `codex mcp get misterdownloadmanager`. In other
clients, add the same stdio command with no arguments to their MCP configuration
(`mcpServers` for Claude Desktop/Cursor, `servers` for VS Code).

This changes the user's Codex configuration. Do it when the user asks to set MDM up
for this assistant, not as a silent side effect of an ordinary download request.

## Troubleshooting

| Message | Meaning and action |
|---|---|
| "Mister Download Manager isn't running" | Start the app; the server cannot start it. |
| "The automation API is off" | Run `api on` while MDM is running. |
| "didn't answer in time" | A dialog in MDM may need an answer (a question, Add torrent); answer it and retry. |
| "refused the request" | `ipc.json` belongs to an earlier start; restart MDM. |
| Tools do not appear | Check the configured path, restart the assistant, and run the server with `--help` to confirm the binary. |
| Client says unknown tool | The release's MCP build may expose fewer tools than the docs; use `tools/list` or the CLI, and see [cli.md](cli.md). |

## Version differences

The public documentation tracks the main branch. Installed releases may lag behind:
the `v0.5.2` MCP server exposed `list_downloads`, `add_download`,
`pause_downloads`, `resume_downloads`, `remove_downloads` and `start_queue`, while its
CLI still lacked `add`, `status`, `pause`, `start`, `remove`, `delete` and queue
commands. Treat `--help` and the actual tool list as authoritative, not this file or
the website.
