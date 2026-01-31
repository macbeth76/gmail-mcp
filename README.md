# Gmail MCP Server

[![CI](https://github.com/macbeth76/gmail-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/macbeth76/gmail-mcp/actions/workflows/ci.yml)

A Model Context Protocol (MCP) server for Gmail integration. This server allows AI assistants like Claude to interact with Gmail for reading, sending, and managing emails.

## Features

- List and search emails
- Read email content with attachments
- Send new emails and replies
- Forward emails
- Create, edit, and send drafts
- Manage labels (create, update, delete)
- Mark as read/unread, star/unstar
- Archive and trash messages
- Batch operations for bulk actions
- Get email threads
- Download attachments

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

### Messages

| Tool | Description |
|------|-------------|
| `gmail_list_messages` | List emails with optional filters |
| `gmail_get_message` | Get full content of a specific email |
| `gmail_send_message` | Send a new email |
| `gmail_search` | Search emails using Gmail syntax |
| `gmail_reply` | Reply to an email thread |
| `gmail_forward_message` | Forward an email to another recipient |
| `gmail_get_thread` | Get all messages in a thread |

### Message Actions

| Tool | Description |
|------|-------------|
| `gmail_mark_as_read` | Mark email as read |
| `gmail_mark_as_unread` | Mark email as unread |
| `gmail_star_message` | Star a message |
| `gmail_unstar_message` | Remove star from a message |
| `gmail_archive_message` | Archive a message (remove from inbox) |
| `gmail_unarchive_message` | Unarchive a message (move back to inbox) |
| `gmail_trash_message` | Move email to trash |
| `gmail_untrash_message` | Remove email from trash |
| `gmail_delete_message` | Permanently delete a message |

### Drafts

| Tool | Description |
|------|-------------|
| `gmail_create_draft` | Create a draft email |
| `gmail_list_drafts` | List all draft emails |
| `gmail_get_draft` | Get a specific draft by ID |
| `gmail_update_draft` | Update an existing draft |
| `gmail_send_draft` | Send an existing draft |
| `gmail_delete_draft` | Delete a draft permanently |

### Labels

| Tool | Description |
|------|-------------|
| `gmail_list_labels` | List all Gmail labels |
| `gmail_modify_labels` | Add/remove labels from emails |
| `gmail_create_label` | Create a new label |
| `gmail_update_label` | Update an existing label |
| `gmail_delete_label` | Delete a label |

### Attachments

| Tool | Description |
|------|-------------|
| `gmail_list_attachments` | List all attachments in a message |
| `gmail_get_attachment` | Get attachment content (base64 encoded) |

### Batch Operations

| Tool | Description |
|------|-------------|
| `gmail_batch_modify` | Modify labels on multiple messages at once |
| `gmail_batch_delete` | Permanently delete multiple messages at once |

### Profile

| Tool | Description |
|------|-------------|
| `gmail_get_profile` | Get the user's Gmail profile (email address, etc.) |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GMAIL_CREDENTIALS_PATH` | Path to OAuth credentials | `~/.gmail-mcp/credentials.json` |
| `GMAIL_TOKEN_PATH` | Path to stored token | `~/.gmail-mcp/token.json` |

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run authentication
npm run auth

# Run in development mode
npm run dev
```

## License

MIT
