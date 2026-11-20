# MDM command line

Paths use the program name without `.exe` on macOS and Linux.

## Standalone download (default)

```text
misterdownloadmanager-cli get URL [-o folder|file] [-c 1..128]
  [-H "Header: value"]... [--checksum hash] [--dns choice] [--adapter name]
```

`-o` is a folder (the server chooses the name) or a full file path. `get` needs no
running app. `Ctrl+C` pauses and prints the `.mdm.json` state path; continue with
`misterdownloadmanager-cli resume state.mdm.json`. The default is 8 connections.
This is the preferred path for ordinary downloads.

Use `--json` immediately after the program name (or after the command) for scripts:
progress objects, then `{"event":"done","path",...}`, or `{"error":...}` with exit
code 1. Capture stdout and surface the final path; do not parse progress text.

Keep the `.mdm.json` state file and its `.part` data together; `resume` needs both.
A checksum mismatch leaves them on disk for inspection or a fresh download.

## Other content

- `video-info URL`, `video-get URL [-q height|compatible] [-f selector] [-o folder]`
  and `playlist-get` need yt-dlp; `install-ytdlp` installs it with signature checks.
- `gallery-get URL` needs gallery-dl; `install-gallery-dl` installs it.
- `torrent-info SOURCE` and `torrent-get SOURCE [--files 0,2] [-o folder]` handle a
  magnet link or `.torrent` file. `magnet:` through the app's MCP `add_download` opens
  Add torrent for the user to choose files, rather than downloading blindly.

Use these instead of hand-rolling yt-dlp, gallery-dl or torrent commands; let MDM's
helper installers verify their downloads.

## Put a download in the running app

The documented command is:

```text
misterdownloadmanager-cli add URL [-o folder] [-f name] [-c category] [-q queue]
  [--checksum hash] [-r referer] [--user-agent agent] [--cookie cookie]
  [--private] [-l] [-s]
```

`-l` queues without starting; `-s` skips the Download File Info dialog; `--private`
does not save it in history or the saved list. It prints `{"id": N}`. This command is
not present in every release, so verify `misterdownloadmanager-cli help add` first
and omit options that help does not list. When unavailable, pass the URL to the app
directly:

```text
misterdownloadmanager.exe /d URL [/p folder] [/f name] [/a] [/n] [/s]
```

`/a` queues without starting; `/n` skips the info window; `/s` starts the main queue.
Switches accept `/` or `-`. If the app is running the command goes to it; otherwise
it starts the app and performs the command.

## Manage the app

Documented commands are `status`/`list`, `pause ID...`, `start ID...`, `remove ID...`,
`delete ID...`, `start-queue [name]` and `stop-queue [name]`, all requiring the
automation API. `remove` keeps files; `delete` removes them. A running download must be
paused before removal. These are also missing from some releases; when absent, use the
MCP tools.

## Checksums and headers

`--checksum` accepts hex MD5, SHA-1, SHA-256, SHA-512 or CRC32, optionally named
(`sha256:...`). A mismatch fails the download. `--cookie -` reads the Cookie header
from standard input, avoiding shell history; prefer that over putting a secret on the
command line.
