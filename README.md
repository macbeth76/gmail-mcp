# Gmail MCP Server

A Model Context Protocol (MCP) server for Gmail integration. This server allows AI assistants like Claude to interact with Gmail for reading, sending, and managing emails.

## Features

- List and search emails
- Read email content
- Send new emails
- Reply to emails
- Create drafts
- Manage labels
- Mark as read/unread
- Move to trash
- Get email threads

## Installation

```bash
npm install gmail-mcp-server
```

Or install from source:

```bash
git clone https://github.com/macbeth76/gmail-mcp.git
cd gmail-mcp
npm install
npm run build
```

## Setup

### 1. Create Google Cloud OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Gmail API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Gmail API" and enable it
4. Create OAuth2 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Select "Desktop app" as the application type
   - Download the JSON file
5. Save the credentials file as `~/.gmail-mcp/credentials.json`

### 2. Authenticate

Run the authentication helper:

```bash
npm run auth
```

This will open a browser window for OAuth authentication and save the token to `~/.gmail-mcp/token.json`.

## Usage with Claude Code

Add to your Claude Code MCP configuration (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "gmail": {
      "command": "node",
      "args": ["/path/to/gmail-mcp/dist/index.js"]
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `gmail_list_messages` | List emails with optional filters |
| `gmail_get_message` | Get full content of a specific email |
| `gmail_send_message` | Send a new email |
| `gmail_search` | Search emails using Gmail syntax |
| `gmail_reply` | Reply to an email thread |
| `gmail_create_draft` | Create a draft email |
| `gmail_list_labels` | List all Gmail labels |
| `gmail_modify_labels` | Add/remove labels from emails |
| `gmail_mark_as_read` | Mark email as read |
| `gmail_mark_as_unread` | Mark email as unread |
| `gmail_trash_message` | Move email to trash |
| `gmail_get_thread` | Get all messages in a thread |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GMAIL_CREDENTIALS_PATH` | Path to OAuth credentials | `~/.gmail-mcp/credentials.json` |
| `GMAIL_TOKEN_PATH` | Path to stored token | `~/.gmail-mcp/token.json` |

## License

MIT
