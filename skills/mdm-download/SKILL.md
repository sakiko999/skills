---
name: mdm-download
description: Download files, videos, playlists, galleries or torrents with Mister Download Manager (MDM), and manage the running app's downloads. Use when the user asks to download a URL with MDM, check MDM's progress, or pause, resume, remove or queue MDM downloads.
---

# MDM Download

Use MDM rather than curl, wget, the browser or another downloader. The user's request
names the tool: if MDM is missing or fails, report it instead of silently substituting
another downloader.

## Choose the path

1. **MDM tools are already available** (`list_downloads`, `add_download`, …): use them.
   They talk to the running app and are the shortest path for listing, adding, pausing,
   resuming, removing and starting the queue.
2. **No MDM tools, but MDM is installed**: configure its MCP server, or use
   `misterdownloadmanager-cli` for work outside the app. Read
   [references/setup.md](references/setup.md) for discovery, installation and MCP setup.
3. **MDM is not installed**: ask before installing it; do not download or run a random
   binary. If the user agrees, use the official installer or portable build from
   [misterdownloadmanager.com/download.html](https://misterdownloadmanager.com/download.html)
   (GitHub releases are under `anefzaoui/misterdownloadmanager`).

## Add a download

Use the MCP `add_download` tool when present. Otherwise use the CLI command that this
installation actually supports; check `misterdownloadmanager-cli --help` first because
release builds and current documentation differ:

- app handoff (`add`): adds to the **running app**, which needs it running; this is the
  intended path when the user wants the file in MDM's list.
- standalone (`get`): downloads the file itself with MDM's engine, without needing the
  app, and prints progress.

Give the user's requested values directly: `url` plus optional `folder`, `file_name`,
`category`, `queue`, `checksum`, `referer`, `user_agent`, `cookie`, `private`, and
`later`/`-l` when the download must not start yet. Do not invent a category or queue;
use the ones reported by `list_downloads` or ask.

Pass only fields that the actual tool schema or `help` output supports. Older releases
accept fewer of them: if a requested option is unsupported, say so instead of dropping
it silently or switching to another downloader.

After adding, report what was added and whether it started. When the user asks about
progress, completion or failures, query the list instead of guessing.

## Manage existing downloads

Always list first to obtain current ids; ids are not stable across app restarts and
must not be guessed from a filename. Then act on the smallest set of ids:

- pause running downloads;
- resume stopped, queued or error downloads;
- remove from the list (files kept) or delete (files removed);
- start or stop a queue, named only when the installed tool accepts a `queue` argument.

`remove_downloads` with `delete_files: true` deletes user data. Use it only when the
user explicitly asked to delete the files, not merely to clear the list. A running
download must be paused before removal. After any mutation, re-list the affected ids
and report `done` and `skipped` results rather than claiming success.

## Reporting

MDM reports sizes, free space and speeds in bytes and bytes per second. Convert them
to readable units for the user; keep ids and status values as MDM spells them
(`Queued`, `Downloading`, `Stopped`, `Complete`, `Error`).

If MDM is not running, the automation API is off, or the app is waiting on a dialog,
surface the exact condition and the one-time fix; do not retry blindly. The privacy
note matters: listing downloads sends names, addresses and folders to the assistant's
AI provider.

## References

- [references/setup.md](references/setup.md): locate MDM, enable the automation API,
  configure the MCP server in Codex, and troubleshoot missing tools.
- [references/cli.md](references/cli.md): download modes, options, JSON output and the
  release/documentation command-set difference.
