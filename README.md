# Skills

Personal Codex skills. Each skill is a self-contained folder under `skills/`.

## Install

Copy a skill folder into your Codex skills directory:

```text
mkdir -p ~/.codex/skills
cp -r skills/mdm-download ~/.codex/skills/
```

On Windows (PowerShell):

```powershell
New-Item -ItemType Directory -Force "$HOME\.codex\skills" | Out-Null
Copy-Item -Recurse skills\mdm-download "$HOME\.codex\skills\"
```

Codex discovers the skill from its YAML frontmatter. Invoke it explicitly with
`$mdm-download`, or let Codex select it when the description matches the request.

## Available skills

### [mdm-download](skills/mdm-download/SKILL.md)

Download files, videos, playlists, galleries and torrents with
[Mister Download Manager](https://misterdownloadmanager.com/) from its CLI. MCP is
documented as an optional setup for controlling a running app.

- `SKILL.md`: CLI-first routing, app handoff, optional MCP, safety rules.
- `references/setup.md`: locating MDM, optional automation API and MCP setup, troubleshooting.
- `references/cli.md`: standalone downloads, helper commands, app handoff, options, JSON output.
