# ADO PR Status

A lightweight VS Code extension for tracking your active Azure DevOps pull requests in one place.

It adds a color-coded status item in the footer and a dedicated PR sidebar so you can quickly see where attention is needed.

## Highlights

- Footer indicator with aggregate health:
	- Green = ready
	- Yellow = pending/action needed
	- Red = conflicts or rejection
- Sidebar grouped by workflow state:
	- User action required
	- Pending approval
	- Approved (not merged)
	- Other
- Open PR in browser from list row click
- Dismiss PRs until next push (auto-undismiss on new commit)
- Optional manual category overrides
- Works across Azure DevOps organizations:
	- Auto-discovers orgs after sign-in
	- Prompts once if multiple orgs are available

## Quick Start

1. Install the extension.
2. Run Sign In to Azure DevOps from the command palette.
3. Click the footer PR status item to open the sidebar.

## Configuration

| Setting | Default | Description |
|---|---|---|
| `prStatus.organization` | `""` | Optional org slug or URL. Leave empty for auto-discovery. |
| `prStatus.mockMode` | `false` | Use static sample data for local testing without ADO access. |

## Main Commands

- PR Status: Show My PRs (Quick List)
- PR Status: Open PR Sidebar
- PR Status: Refresh Now
- PR Status: Sign In to Azure DevOps
- PR Status: Log Out of Azure DevOps
- PR Status: Undismiss a PR...
- PR Status: Undismiss All PRs

## Local Development

```bash
npm install
npm run build
npm test
```

Press F5 to launch an Extension Development Host.

## Package

```bash
npm run package
```
