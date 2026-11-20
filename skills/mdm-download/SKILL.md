---
name: mdm-download
description: Download files, videos, playlists, galleries or torrents with Mister Download Manager's CLI. Optionally configure MDM's MCP server when the user wants the assistant to control a running MDM. Use when the user asks to download with MDM or manage MDM downloads.
---

# MDM Download

Use MDM rather than curl, wget, the browser or another downloader. The user's request
names the tool: if MDM is missing or fails, report it instead of silently substituting
another downloader.

Default to `misterdownloadmanager-cli`. Use MCP only when the user explicitly wants
the running app's downloads controlled through MCP, or when this CLI build cannot
manage the app and MCP is already configured. Do not make MCP a prerequisite for an
ordinary download.

## Locate MDM

Find the CLI before concluding MDM is absent; read [references/setup.md](references/setup.md)
for platform paths and the portable layout. If MDM is not installed, ask before
installing it; do not download or run a random binary. If the user agrees, use the
official installer or portable build from
[misterdownloadmanager.com/download.html](https://misterdownloadmanager.com/download.html)
(GitHub releases are under `anefzaoui/misterdownloadmanager`).

## Download with the CLI

Use `misterdownloadmanager-cli get URL` for a normal file download. It is MDM's
standalone engine: the app need not run, and progress and resume state stay in the
terminal. Check `misterdownloadmanager-cli --help` and `help <command>` first because
release builds and current documentation differ.

Pass the user's requested values directly: `-o` for a folder or full file path,
`-c` for connections, `-H`/`-r`/`--user-agent`/`--cookie` for request headers,
`--checksum` for an expected hash, `--dns` or `--adapter` for routing.

Use `--json` when collecting result paths or progress for a script; parse the JSON
events instead of the human-readable progress text. `Ctrl+C` pauses and writes a
`.mdm.json` state file; continue with `misterdownloadmanager-cli resume <state file>`
and report the resumed path. Do not restart the download from zero when resume state
exists.

For video, playlist, gallery and torrent requests, use the CLI's `video-info`,
`video-get`, `playlist-get`, `gallery-get`, `torrent-info` and `torrent-get` commands
instead of calling yt-dlp, gallery-dl or a torrent client directly. Their helper
installers verify downloads.

## Put a download in the running app

When the user wants the task in MDM's own download list, use the installed CLI's
`add` command if `help add` shows it. Otherwise use the app's command line:

```text
misterdownloadmanager.exe /d URL [/p folder] [/f name] [/a] [/n] [/s]
```

`/a` queues without starting; `/n` skips the info dialog; `/s` starts the main queue.
If the app is running the command goes to it; otherwise it starts the app and carries
it out.

Only if the user asks to use MCP for app control, use `add_download` and pass fields
the actual tool schema supports. Magnet links open Add torrent for the user to choose
files; do not assume all files should be downloaded.

After adding, report what was added and whether it started. Do not invent a category
or queue; use names reported by the app/CLI or ask.

## Manage existing downloads

CLI management commands (`status`, `pause`, `start`, `remove`, `delete`,
`start-queue`, `stop-queue`) are not present in every release; verify `help` first.
Use MCP only when it is already configured and the user wants assistant-driven
control of the running app.

Always list first to obtain current ids; ids are not stable across app restarts and
must not be guessed from a filename. Then act on the smallest set of ids:

- pause running downloads;
- resume stopped, queued or error downloads;
- remove from the list (files kept) or delete (files removed);
- start or stop a queue, named only when the installed interface accepts a name.

Deleting with `delete` or `delete_files: true` removes user data. Use it only when the
user explicitly asked to delete the files, not merely to clear the list. A running
download must be paused before removal. After any mutation, re-list the affected ids
and report done and skipped results rather than claiming success.

## Optional MCP

MDM's MCP server controls only an **already running** app; it cannot start MDM. Enable
the automation API once, then register the server only if the user wants this mode:

```text
misterdownloadmanager-cli api on
codex mcp add misterdownloadmanager -- "<path to misterdownloadmanager-mcp>"
```

The MCP tools available depend on the installed release. The v0.5.2 build exposes
`add_download`, `list_downloads`, `pause_downloads`, `remove_downloads`,
`resume_downloads` and `start_queue`. If the user does not request MCP, leave their
Codex MCP configuration untouched.

## Reporting and errors

MDM reports sizes, free space and speeds in bytes and bytes per second. Convert them
to readable units for the user; keep ids and status values as MDM spells them
(`Queued`, `Downloading`, `Stopped`, `Complete`, `Error`).

Report the final path and exit status of a completed CLI download. For failures,
surface MDM's JSON error or exit code; do not retry blindly. A checksum mismatch
keeps the `.part` data and state file, so mention both instead of deleting them.

Privacy differs by path: CLI output stays local to the terminal, while MCP listing
sends download names, addresses and folders to the assistant's AI provider. Mention
that only when MCP is in use.

## References

- [references/setup.md](references/setup.md): locate MDM, optional MCP setup, and
  troubleshooting.
- [references/cli.md](references/cli.md): CLI commands, options, JSON output and
  release/documentation differences.
