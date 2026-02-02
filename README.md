# Gmail MCP Server

[![CI](https://github.com/macbeth76/gmail-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/macbeth76/gmail-mcp/actions/workflows/ci.yml)

A Model Context Protocol (MCP) server for Gmail, Google Photos, and Video analysis. This server allows AI assistants like Claude to interact with your email, photos, and analyze videos locally.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         MCP CLIENT                               │
│                (Claude Desktop, IDE, CLI, etc.)                  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ JSON-RPC over stdio
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      GMAIL MCP SERVER                            │
│                                                                  │
│    ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐     │
│    │    GMAIL     │  │    PHOTOS    │  │      VIDEO       │     │
│    │   32 tools   │  │   9 tools    │  │     6 tools      │     │
│    └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘     │
│           │                 │                   │                │
└───────────┼─────────────────┼───────────────────┼────────────────┘
            │                 │                   │
            ▼                 ▼                   ▼
     ┌────────────┐    ┌────────────┐    ┌─────────────────┐
     │ Gmail API  │    │ Drive API  │    │  Local Tools    │
     │            │    │  (Photos)  │    │ FFmpeg, Ollama, │
     │            │    │            │    │ Whisper-cpp     │
     └────────────┘    └────────────┘    └─────────────────┘
```

## Features

### Gmail (36 tools)
- List and search emails with Gmail query syntax
- Read email content with attachments
- Send new emails, replies, and forwards
- Create, edit, and send drafts
- Manage labels (create, update, delete)
- Mark as read/unread, star/unstar
- Archive and trash messages
- Batch operations for bulk actions
- Download attachments
- **AI-powered auto-labeling** using Ollama

### Google Photos (9 tools)
- List and search photos/videos
- Browse albums (personal and shared)
- Create albums and add media
- Share albums with others
- Access media metadata

### Video Analysis (6 tools)
- Get video metadata (duration, resolution, codec)
- Extract frames at specific timestamps
- Analyze video content using AI vision (Ollama + LLaVA)
- Transcribe audio using Whisper
- Generate video summaries

## Installation

```bash
git clone https://github.com/macbeth76/gmail-mcp.git
cd gmail-mcp
npm install
npm run build
```

### Optional Dependencies for Video Analysis

```bash
# FFmpeg for video processing
brew install ffmpeg

# Ollama for AI vision analysis
brew install ollama
ollama pull llava

# Whisper for transcription
brew install whisper-cpp
```

## Setup

### 1. Create Google Cloud OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the required APIs:
   - Navigate to "APIs & Services" > "Library"
   - Enable **Gmail API**
   - Enable **Google Drive API** (for Photos access)
4. Configure OAuth consent screen:
   - Go to "APIs & Services" > "OAuth consent screen"
   - Add scopes: `gmail.readonly`, `gmail.send`, `gmail.modify`, `gmail.labels`, `drive.readonly`, `drive.photos.readonly`
   - Add yourself as a test user
5. Create OAuth2 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Select "Desktop app" as the application type
   - Download the JSON file
6. Save the credentials file as `~/.gmail-mcp/credentials.json`

### 2. Authenticate

```bash
npm run auth
```

This opens a browser for OAuth authentication and saves the token to `~/.gmail-mcp/token.json`.

## Usage with Claude

Add to your Claude MCP configuration:

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

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

**Claude Code** (`~/.claude.json`):

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

## Available Tools (51 total)

### Gmail Messages

| Tool | Description |
|------|-------------|
| `gmail_list_messages` | List emails with optional filters |
| `gmail_get_message` | Get full content of a specific email |
| `gmail_send_message` | Send a new email |
| `gmail_search` | Search emails using Gmail syntax |
| `gmail_reply` | Reply to an email thread |
| `gmail_forward_message` | Forward an email to another recipient |
| `gmail_get_thread` | Get all messages in a thread |

### Gmail Message Actions

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

### Gmail Drafts

| Tool | Description |
|------|-------------|
| `gmail_create_draft` | Create a draft email |
| `gmail_list_drafts` | List all draft emails |
| `gmail_get_draft` | Get a specific draft by ID |
| `gmail_update_draft` | Update an existing draft |
| `gmail_send_draft` | Send an existing draft |
| `gmail_delete_draft` | Delete a draft permanently |

### Gmail Labels

| Tool | Description |
|------|-------------|
| `gmail_list_labels` | List all Gmail labels |
| `gmail_modify_labels` | Add/remove labels from emails |
| `gmail_create_label` | Create a new label |
| `gmail_update_label` | Update an existing label |
| `gmail_delete_label` | Delete a label |

### Gmail Attachments

| Tool | Description |
|------|-------------|
| `gmail_list_attachments` | List all attachments in a message |
| `gmail_get_attachment` | Get attachment content (base64 encoded) |

### Gmail Batch Operations

| Tool | Description |
|------|-------------|
| `gmail_batch_modify` | Modify labels on multiple messages at once |
| `gmail_batch_delete` | Permanently delete multiple messages at once |

### Gmail Profile

| Tool | Description |
|------|-------------|
| `gmail_get_profile` | Get the user's Gmail profile |

### Google Photos

| Tool | Description |
|------|-------------|
| `photos_list_albums` | List all photo albums |
| `photos_get_album` | Get details of a specific album |
| `photos_list_media` | List photos/videos (optionally by album) |
| `photos_get_media` | Get details of a specific media item |
| `photos_search` | Search photos by date range or content type |
| `photos_create_album` | Create a new album |
| `photos_add_to_album` | Add media items to an album |
| `photos_share_album` | Share an album |
| `photos_list_shared_albums` | List albums shared with you |

### Video Analysis

| Tool | Description |
|------|-------------|
| `video_get_info` | Get video metadata (duration, resolution, codec) |
| `video_extract_frame` | Extract a frame at a specific timestamp |
| `video_analyze` | Analyze video using Ollama LLaVA vision model |
| `video_analyze_frame` | Analyze a specific frame with custom prompt |
| `video_transcribe` | Transcribe audio using Whisper-cpp |
| `video_summarize` | Generate summary using transcription + AI |

### AI Auto-Labeling

| Tool | Description |
|------|-------------|
| `gmail_suggest_labels` | Analyze email with AI and suggest labels (read-only) |
| `gmail_auto_label` | Analyze email and automatically apply suggested labels |
| `gmail_bulk_auto_label` | Auto-label multiple emails matching a search query |
| `gmail_create_label_rules` | Analyze sender patterns and suggest labeling rules |

**Example usage:**

```javascript
// Get label suggestions for an email
gmail_suggest_labels({
  messageId: "abc123",
  customLabels: ["Work", "Personal", "Finance", "Travel"]
})

// Auto-label an email (creates missing labels)
gmail_auto_label({
  messageId: "abc123",
  createMissing: true
})

// Bulk auto-label all unread newsletters
gmail_bulk_auto_label({
  query: "is:unread from:newsletter",
  maxMessages: 20,
  customLabels: ["Newsletter", "Promotions"]
})

// Analyze sender patterns for rule suggestions
gmail_create_label_rules({
  sampleSize: 100
})
```

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
