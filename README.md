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
[Mister Download Manager](https://misterdownloadmanager.com/), and manage the running
app's downloads through its MCP server or command line.

- `SKILL.md`: routing, download and management workflow, safety rules.
- `references/setup.md`: locating MDM, enabling the automation API, MCP setup, troubleshooting.
- `references/cli.md`: app handoff vs standalone download, options, JSON output.
