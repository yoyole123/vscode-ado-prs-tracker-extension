# Au10tix PR Status

A personal VS Code extension that shows your active Azure DevOps pull requests
as a coloured indicator in the status bar and a dedicated sidebar view.

## Features

- **Status bar indicator** — colour-coded (green / yellow / red) aggregate PR health at a glance
- **Sidebar view** — PRs grouped by category (Approved · User action required · Pending approval · Other); click a row to open it in the browser
- **Dismiss** — hide a PR until a new commit is pushed to it
- **Move to category** — manually override which group a PR belongs to
- **Quick List** — command-palette fallback (`PR Status: Show My PRs (Quick List)`)

## Requirements

- VS Code 1.85+
- An Azure DevOps account (any organisation)
- Sign in via the Microsoft auth provider when prompted (uses VS Code's built-in auth — no `az` CLI needed)

## Installation

Install from the `.vsix` package:

```bash
code --install-extension pr-status.vsix
```

Or via the UI: **Extensions → `...` → Install from VSIX…**

## Configuration

| Setting | Type | Default | Description |
|---|---|---|---|
| `prStatus.organization` | string | `""` | Optional org slug (or URL). Leave empty for auto-discovery after sign in |
| `prStatus.mockMode` | boolean | `false` | Use static sample data instead of Azure DevOps — useful for testing on machines without ADO access |

## Commands

| Command | Description |
|---|---|
| `PR Status: Show My PRs (Quick List)` | Open the command-palette PR picker |
| `PR Status: Open PR Sidebar` | Focus the sidebar view |
| `PR Status: Refresh Now` | Fetch latest PR data immediately |
| `PR Status: Sign In to Azure DevOps` | Trigger the AAD consent flow |
| `PR Status: Undismiss a PR...` | Restore a single dismissed PR |
| `PR Status: Undismiss All PRs` | Clear all dismissals |
