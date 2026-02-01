#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { google, gmail_v1, drive_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import * as fs from "fs";
import * as path from "path";
import { exec, execSync } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Gmail and Drive/Photos scopes required
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.photos.readonly",
];

// Paths for credentials
const CREDENTIALS_PATH = process.env.GMAIL_CREDENTIALS_PATH || path.join(process.env.HOME || "", ".gmail-mcp", "credentials.json");
const TOKEN_PATH = process.env.GMAIL_TOKEN_PATH || path.join(process.env.HOME || "", ".gmail-mcp", "token.json");

// Tool definitions
const tools: Tool[] = [
  {
    name: "gmail_list_messages",
    description: "List emails from Gmail inbox with optional filters",
    inputSchema: {
      type: "object",
      properties: {
        maxResults: {
          type: "number",
          description: "Maximum number of messages to return (default: 10)",
        },
        query: {
          type: "string",
          description: "Gmail search query (e.g., 'is:unread', 'from:example@gmail.com')",
        },
        labelIds: {
          type: "array",
          items: { type: "string" },
          description: "Filter by label IDs (e.g., ['INBOX', 'UNREAD'])",
        },
      },
    },
  },
  {
    name: "gmail_get_message",
    description: "Get a specific email by ID with full content",
    inputSchema: {
      type: "object",
      properties: {
        messageId: {
          type: "string",
          description: "The ID of the message to retrieve",
        },
      },
      required: ["messageId"],
    },
  },
  {
    name: "gmail_send_message",
    description: "Send an email",
    inputSchema: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient email address",
        },
        subject: {
          type: "string",
          description: "Email subject",
        },
        body: {
          type: "string",
          description: "Email body (plain text)",
        },
        cc: {
          type: "string",
          description: "CC recipients (comma-separated)",
        },
        bcc: {
          type: "string",
          description: "BCC recipients (comma-separated)",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "gmail_search",
    description: "Search emails using Gmail search syntax",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Gmail search query",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results (default: 10)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "gmail_modify_labels",
    description: "Add or remove labels from a message",
    inputSchema: {
      type: "object",
      properties: {
        messageId: {
          type: "string",
          description: "The ID of the message",
        },
        addLabelIds: {
          type: "array",
          items: { type: "string" },
          description: "Label IDs to add",
        },
        removeLabelIds: {
          type: "array",
          items: { type: "string" },
          description: "Label IDs to remove",
        },
      },
      required: ["messageId"],
    },
  },
  {
    name: "gmail_list_labels",
    description: "List all labels in the Gmail account",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "gmail_trash_message",
    description: "Move a message to trash",
    inputSchema: {
      type: "object",
      properties: {
        messageId: {
          type: "string",
          description: "The ID of the message to trash",
        },
      },
      required: ["messageId"],
    },
  },
  {
    name: "gmail_mark_as_read",
    description: "Mark a message as read",
    inputSchema: {
      type: "object",
      properties: {
        messageId: {
          type: "string",
          description: "The ID of the message to mark as read",
        },
      },
      required: ["messageId"],
    },
  },
  {
    name: "gmail_mark_as_unread",
    description: "Mark a message as unread",
    inputSchema: {
      type: "object",
      properties: {
        messageId: {
          type: "string",
          description: "The ID of the message to mark as unread",
        },
      },
      required: ["messageId"],
    },
  },
  {
    name: "gmail_get_thread",
    description: "Get all messages in a thread",
    inputSchema: {
      type: "object",
      properties: {
        threadId: {
          type: "string",
          description: "The ID of the thread",
        },
      },
      required: ["threadId"],
    },
  },
  {
    name: "gmail_reply",
    description: "Reply to an existing email thread",
    inputSchema: {
      type: "object",
      properties: {
        messageId: {
          type: "string",
          description: "The ID of the message to reply to",
        },
        body: {
          type: "string",
          description: "Reply body (plain text)",
        },
        replyAll: {
          type: "boolean",
          description: "Reply to all recipients (default: false)",
        },
      },
      required: ["messageId", "body"],
    },
  },
  {
    name: "gmail_create_draft",
    description: "Create a draft email",
    inputSchema: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient email address",
        },
        subject: {
          type: "string",
          description: "Email subject",
        },
        body: {
          type: "string",
          description: "Email body (plain text)",
        },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "gmail_list_drafts",
    description: "List all draft emails",
    inputSchema: {
      type: "object",
      properties: {
        maxResults: {
          type: "number",
          description: "Maximum number of drafts to return (default: 10)",
        },
      },
    },
  },
  {
    name: "gmail_get_draft",
    description: "Get a specific draft by ID",
    inputSchema: {
      type: "object",
      properties: {
        draftId: {
          type: "string",
          description: "The ID of the draft to retrieve",
        },
      },
      required: ["draftId"],
    },
  },
  {
    name: "gmail_update_draft",
    description: "Update an existing draft",
    inputSchema: {
      type: "object",
      properties: {
        draftId: {
          type: "string",
          description: "The ID of the draft to update",
        },
        to: {
          type: "string",
          description: "Recipient email address",
        },
        subject: {
          type: "string",
          description: "Email subject",
        },
        body: {
          type: "string",
          description: "Email body (plain text)",
        },
      },
      required: ["draftId", "to", "subject", "body"],
    },
  },
  {
    name: "gmail_send_draft",
    description: "Send an existing draft",
    inputSchema: {
      type: "object",
      properties: {
        draftId: {
          type: "string",
          description: "The ID of the draft to send",
        },
      },
      required: ["draftId"],
    },
  },
  {
    name: "gmail_delete_draft",
    description: "Delete a draft permanently",
    inputSchema: {
      type: "object",
      properties: {
        draftId: {
          type: "string",
          description: "The ID of the draft to delete",
        },
      },
      required: ["draftId"],
    },
  },
  {
    name: "gmail_get_attachment",
    description: "Get attachment metadata and content from a message",
    inputSchema: {
      type: "object",
      properties: {
        messageId: {
          type: "string",
          description: "The ID of the message containing the attachment",
        },
        attachmentId: {
          type: "string",
          description: "The ID of the attachment",
        },
      },
      required: ["messageId", "attachmentId"],
    },
  },
  {
    name: "gmail_list_attachments",
    description: "List all attachments in a message",
    inputSchema: {
      type: "object",
      properties: {
        messageId: {
          type: "string",
          description: "The ID of the message",
        },
      },
      required: ["messageId"],
    },
  },
  {
    name: "gmail_archive_message",
    description: "Archive a message (remove from inbox)",
    inputSchema: {
      type: "object",
      properties: {
        messageId: {
          type: "string",
          description: "The ID of the message to archive",
        },
      },
      required: ["messageId"],
    },
  },
  {
    name: "gmail_unarchive_message",
    description: "Unarchive a message (move back to inbox)",
    inputSchema: {
      type: "object",
      properties: {
        messageId: {
          type: "string",
          description: "The ID of the message to unarchive",
        },
      },
      required: ["messageId"],
    },
  },
  {
    name: "gmail_untrash_message",
    description: "Remove a message from trash",
    inputSchema: {
      type: "object",
      properties: {
        messageId: {
          type: "string",
          description: "The ID of the message to untrash",
        },
      },
      required: ["messageId"],
    },
  },
  {
    name: "gmail_delete_message",
    description: "Permanently delete a message (cannot be undone)",
    inputSchema: {
      type: "object",
      properties: {
        messageId: {
          type: "string",
          description: "The ID of the message to delete permanently",
        },
      },
      required: ["messageId"],
    },
  },
  {
    name: "gmail_create_label",
    description: "Create a new label",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The name of the label",
        },
        labelListVisibility: {
          type: "string",
          enum: ["labelShow", "labelShowIfUnread", "labelHide"],
          description: "Visibility in label list (default: labelShow)",
        },
        messageListVisibility: {
          type: "string",
          enum: ["show", "hide"],
          description: "Visibility in message list (default: show)",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "gmail_update_label",
    description: "Update an existing label",
    inputSchema: {
      type: "object",
      properties: {
        labelId: {
          type: "string",
          description: "The ID of the label to update",
        },
        name: {
          type: "string",
          description: "New name for the label",
        },
      },
      required: ["labelId", "name"],
    },
  },
  {
    name: "gmail_delete_label",
    description: "Delete a label",
    inputSchema: {
      type: "object",
      properties: {
        labelId: {
          type: "string",
          description: "The ID of the label to delete",
        },
      },
      required: ["labelId"],
    },
  },
  {
    name: "gmail_get_profile",
    description: "Get the user's Gmail profile (email address, etc.)",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "gmail_forward_message",
    description: "Forward an email to another recipient",
    inputSchema: {
      type: "object",
      properties: {
        messageId: {
          type: "string",
          description: "The ID of the message to forward",
        },
        to: {
          type: "string",
          description: "Recipient email address",
        },
        additionalMessage: {
          type: "string",
          description: "Additional message to include (optional)",
        },
      },
      required: ["messageId", "to"],
    },
  },
  {
    name: "gmail_star_message",
    description: "Star a message",
    inputSchema: {
      type: "object",
      properties: {
        messageId: {
          type: "string",
          description: "The ID of the message to star",
        },
      },
      required: ["messageId"],
    },
  },
  {
    name: "gmail_unstar_message",
    description: "Remove star from a message",
    inputSchema: {
      type: "object",
      properties: {
        messageId: {
          type: "string",
          description: "The ID of the message to unstar",
        },
      },
      required: ["messageId"],
    },
  },
  {
    name: "gmail_batch_modify",
    description: "Modify labels on multiple messages at once",
    inputSchema: {
      type: "object",
      properties: {
        messageIds: {
          type: "array",
          items: { type: "string" },
          description: "List of message IDs to modify",
        },
        addLabelIds: {
          type: "array",
          items: { type: "string" },
          description: "Label IDs to add",
        },
        removeLabelIds: {
          type: "array",
          items: { type: "string" },
          description: "Label IDs to remove",
        },
      },
      required: ["messageIds"],
    },
  },
  {
    name: "gmail_batch_delete",
    description: "Permanently delete multiple messages at once",
    inputSchema: {
      type: "object",
      properties: {
        messageIds: {
          type: "array",
          items: { type: "string" },
          description: "List of message IDs to delete",
        },
      },
      required: ["messageIds"],
    },
  },
  // Google Photos tools
  {
    name: "photos_list_albums",
    description: "List all albums in Google Photos",
    inputSchema: {
      type: "object",
      properties: {
        pageSize: {
          type: "number",
          description: "Maximum number of albums to return (default: 20, max: 50)",
        },
        pageToken: {
          type: "string",
          description: "Token for pagination",
        },
      },
    },
  },
  {
    name: "photos_get_album",
    description: "Get details of a specific album",
    inputSchema: {
      type: "object",
      properties: {
        albumId: {
          type: "string",
          description: "The ID of the album",
        },
      },
      required: ["albumId"],
    },
  },
  {
    name: "photos_list_media",
    description: "List media items (photos/videos) in Google Photos",
    inputSchema: {
      type: "object",
      properties: {
        pageSize: {
          type: "number",
          description: "Maximum number of items to return (default: 25, max: 100)",
        },
        pageToken: {
          type: "string",
          description: "Token for pagination",
        },
        albumId: {
          type: "string",
          description: "Filter by album ID (optional)",
        },
      },
    },
  },
  {
    name: "photos_get_media",
    description: "Get details of a specific media item",
    inputSchema: {
      type: "object",
      properties: {
        mediaItemId: {
          type: "string",
          description: "The ID of the media item",
        },
      },
      required: ["mediaItemId"],
    },
  },
  {
    name: "photos_search",
    description: "Search for photos and videos by filename or content",
    inputSchema: {
      type: "object",
      properties: {
        pageSize: {
          type: "number",
          description: "Maximum number of items to return (default: 25)",
        },
        query: {
          type: "string",
          description: "Search query to find in filenames",
        },
        mimeType: {
          type: "string",
          description: "Filter by mime type (e.g., 'image/jpeg', 'video/mp4')",
        },
      },
    },
  },
  {
    name: "photos_create_album",
    description: "Create a new album",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Title of the album",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "photos_add_to_album",
    description: "Add media items to an album",
    inputSchema: {
      type: "object",
      properties: {
        albumId: {
          type: "string",
          description: "The ID of the album",
        },
        mediaItemIds: {
          type: "array",
          items: { type: "string" },
          description: "List of media item IDs to add",
        },
      },
      required: ["albumId", "mediaItemIds"],
    },
  },
  {
    name: "photos_share_album",
    description: "Share an album and get a shareable link",
    inputSchema: {
      type: "object",
      properties: {
        albumId: {
          type: "string",
          description: "The ID of the album to share",
        },
        isCollaborative: {
          type: "boolean",
          description: "Allow others to add photos (default: false)",
        },
        isCommentable: {
          type: "boolean",
          description: "Allow comments (default: true)",
        },
      },
      required: ["albumId"],
    },
  },
  {
    name: "photos_list_shared_albums",
    description: "List albums shared with you",
    inputSchema: {
      type: "object",
      properties: {
        pageSize: {
          type: "number",
          description: "Maximum number of albums to return (default: 20)",
        },
        pageToken: {
          type: "string",
          description: "Token for pagination",
        },
      },
    },
  },
  // Video Analysis Tools (Ollama + FFmpeg)
  {
    name: "video_get_info",
    description: "Get video metadata (duration, resolution, codec, etc.) using FFmpeg",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Local path to the video file",
        },
        driveFileId: {
          type: "string",
          description: "Google Drive file ID (will download temporarily)",
        },
      },
    },
  },
  {
    name: "video_extract_frame",
    description: "Extract a frame from a video at a specific timestamp",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Local path to the video file",
        },
        driveFileId: {
          type: "string",
          description: "Google Drive file ID (will download temporarily)",
        },
        timestamp: {
          type: "string",
          description: "Timestamp to extract frame (e.g., '00:00:05' or '5' for 5 seconds)",
        },
      },
    },
  },
  {
    name: "video_analyze",
    description: "Analyze a video using Ollama LLaVA - extracts frames and describes content",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Local path to the video file",
        },
        driveFileId: {
          type: "string",
          description: "Google Drive file ID (will download temporarily)",
        },
        prompt: {
          type: "string",
          description: "What to analyze (default: 'Describe what you see in this video frame')",
        },
        frameCount: {
          type: "number",
          description: "Number of frames to analyze (default: 3 - start, middle, end)",
        },
        model: {
          type: "string",
          description: "Ollama model to use (default: 'llava')",
        },
      },
    },
  },
  {
    name: "video_analyze_frame",
    description: "Analyze a single image/frame with Ollama LLaVA",
    inputSchema: {
      type: "object",
      properties: {
        imagePath: {
          type: "string",
          description: "Path to the image file",
        },
        prompt: {
          type: "string",
          description: "What to analyze (default: 'Describe this image in detail')",
        },
        model: {
          type: "string",
          description: "Ollama model to use (default: 'llava')",
        },
      },
      required: ["imagePath"],
    },
  },
];

class GmailMCPServer {
  private server: Server;
  private oauth2Client: OAuth2Client | null = null;
  private gmail: gmail_v1.Gmail | null = null;
  private drive: drive_v3.Drive | null = null;

  constructor() {
    this.server = new Server(
      {
        name: "gmail-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private async initializeGmail(): Promise<void> {
    if (this.gmail) return;

    if (!fs.existsSync(CREDENTIALS_PATH)) {
      throw new Error(
        `Credentials file not found at ${CREDENTIALS_PATH}. Please set up OAuth2 credentials from Google Cloud Console.`
      );
    }

    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

    this.oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    if (fs.existsSync(TOKEN_PATH)) {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
      this.oauth2Client.setCredentials(token);
    } else {
      throw new Error(
        `Token file not found at ${TOKEN_PATH}. Please run the authentication flow first.`
      );
    }

    this.gmail = google.gmail({ version: "v1", auth: this.oauth2Client });
    this.drive = google.drive({ version: "v3", auth: this.oauth2Client });
  }

  private getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
    const header = headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
    return header?.value || "";
  }

  private decodeBase64(data: string): string {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
  }

  private getMessageBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
    if (!payload) return "";

    if (payload.body?.data) {
      return this.decodeBase64(payload.body.data);
    }

    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === "text/plain" && part.body?.data) {
          return this.decodeBase64(part.body.data);
        }
      }
      for (const part of payload.parts) {
        if (part.mimeType === "text/html" && part.body?.data) {
          return this.decodeBase64(part.body.data);
        }
      }
      for (const part of payload.parts) {
        const nestedBody = this.getMessageBody(part);
        if (nestedBody) return nestedBody;
      }
    }

    return "";
  }

  private createRawMessage(to: string, subject: string, body: string, cc?: string, bcc?: string, threadId?: string, references?: string, inReplyTo?: string): string {
    const messageParts = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=utf-8",
    ];

    if (cc) messageParts.push(`Cc: ${cc}`);
    if (bcc) messageParts.push(`Bcc: ${bcc}`);
    if (references) messageParts.push(`References: ${references}`);
    if (inReplyTo) messageParts.push(`In-Reply-To: ${inReplyTo}`);

    messageParts.push("", body);

    const message = messageParts.join("\r\n");
    return Buffer.from(message).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools,
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;

      try {
        await this.initializeGmail();

        switch (name) {
          case "gmail_list_messages":
            return await this.listMessages(args);
          case "gmail_get_message":
            return await this.getMessage(args);
          case "gmail_send_message":
            return await this.sendMessage(args);
          case "gmail_search":
            return await this.searchMessages(args);
          case "gmail_modify_labels":
            return await this.modifyLabels(args);
          case "gmail_list_labels":
            return await this.listLabels();
          case "gmail_trash_message":
            return await this.trashMessage(args);
          case "gmail_mark_as_read":
            return await this.markAsRead(args);
          case "gmail_mark_as_unread":
            return await this.markAsUnread(args);
          case "gmail_get_thread":
            return await this.getThread(args);
          case "gmail_reply":
            return await this.replyToMessage(args);
          case "gmail_create_draft":
            return await this.createDraft(args);
          case "gmail_list_drafts":
            return await this.listDrafts(args);
          case "gmail_get_draft":
            return await this.getDraft(args);
          case "gmail_update_draft":
            return await this.updateDraft(args);
          case "gmail_send_draft":
            return await this.sendDraft(args);
          case "gmail_delete_draft":
            return await this.deleteDraft(args);
          case "gmail_get_attachment":
            return await this.getAttachment(args);
          case "gmail_list_attachments":
            return await this.listAttachments(args);
          case "gmail_archive_message":
            return await this.archiveMessage(args);
          case "gmail_unarchive_message":
            return await this.unarchiveMessage(args);
          case "gmail_untrash_message":
            return await this.untrashMessage(args);
          case "gmail_delete_message":
            return await this.deleteMessage(args);
          case "gmail_create_label":
            return await this.createLabel(args);
          case "gmail_update_label":
            return await this.updateLabel(args);
          case "gmail_delete_label":
            return await this.deleteLabel(args);
          case "gmail_get_profile":
            return await this.getProfile();
          case "gmail_forward_message":
            return await this.forwardMessage(args);
          case "gmail_star_message":
            return await this.starMessage(args);
          case "gmail_unstar_message":
            return await this.unstarMessage(args);
          case "gmail_batch_modify":
            return await this.batchModify(args);
          case "gmail_batch_delete":
            return await this.batchDelete(args);
          // Google Photos cases
          case "photos_list_albums":
            return await this.photosListAlbums(args);
          case "photos_get_album":
            return await this.photosGetAlbum(args);
          case "photos_list_media":
            return await this.photosListMedia(args);
          case "photos_get_media":
            return await this.photosGetMedia(args);
          case "photos_search":
            return await this.photosSearch(args);
          case "photos_create_album":
            return await this.photosCreateAlbum(args);
          case "photos_add_to_album":
            return await this.photosAddToAlbum(args);
          case "photos_share_album":
            return await this.photosShareAlbum(args);
          case "photos_list_shared_albums":
            return await this.photosListSharedAlbums(args);
          // Video analysis tools
          case "video_get_info":
            return await this.videoGetInfo(args);
          case "video_extract_frame":
            return await this.videoExtractFrame(args);
          case "video_analyze":
            return await this.videoAnalyze(args);
          case "video_analyze_frame":
            return await this.videoAnalyzeFrame(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${errorMessage}` }],
          isError: true,
        };
      }
    });
  }

  private async listMessages(args: Record<string, unknown>) {
    const maxResults = (args.maxResults as number) || 10;
    const query = args.query as string | undefined;
    const labelIds = args.labelIds as string[] | undefined;

    const response = await this.gmail!.users.messages.list({
      userId: "me",
      maxResults,
      q: query,
      labelIds,
    });

    const messages = response.data.messages || [];
    const results = [];

    for (const msg of messages) {
      const details = await this.gmail!.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date"],
      });

      results.push({
        id: msg.id,
        threadId: msg.threadId,
        from: this.getHeader(details.data.payload?.headers, "From"),
        to: this.getHeader(details.data.payload?.headers, "To"),
        subject: this.getHeader(details.data.payload?.headers, "Subject"),
        date: this.getHeader(details.data.payload?.headers, "Date"),
        snippet: details.data.snippet,
        labelIds: details.data.labelIds,
      });
    }

    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  }

  private async getMessage(args: Record<string, unknown>) {
    const messageId = args.messageId as string;

    const response = await this.gmail!.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });

    const message = response.data;
    const body = this.getMessageBody(message.payload);

    const result = {
      id: message.id,
      threadId: message.threadId,
      from: this.getHeader(message.payload?.headers, "From"),
      to: this.getHeader(message.payload?.headers, "To"),
      cc: this.getHeader(message.payload?.headers, "Cc"),
      subject: this.getHeader(message.payload?.headers, "Subject"),
      date: this.getHeader(message.payload?.headers, "Date"),
      body,
      labelIds: message.labelIds,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  private async sendMessage(args: Record<string, unknown>) {
    const to = args.to as string;
    const subject = args.subject as string;
    const body = args.body as string;
    const cc = args.cc as string | undefined;
    const bcc = args.bcc as string | undefined;

    const raw = this.createRawMessage(to, subject, body, cc, bcc);

    const response = await this.gmail!.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, messageId: response.data.id }, null, 2),
        },
      ],
    };
  }

  private async searchMessages(args: Record<string, unknown>) {
    const query = args.query as string;
    const maxResults = (args.maxResults as number) || 10;

    return await this.listMessages({ query, maxResults });
  }

  private async modifyLabels(args: Record<string, unknown>) {
    const messageId = args.messageId as string;
    const addLabelIds = args.addLabelIds as string[] | undefined;
    const removeLabelIds = args.removeLabelIds as string[] | undefined;

    const response = await this.gmail!.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        addLabelIds,
        removeLabelIds,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, labelIds: response.data.labelIds }, null, 2),
        },
      ],
    };
  }

  private async listLabels() {
    const response = await this.gmail!.users.labels.list({
      userId: "me",
    });

    const labels = response.data.labels?.map((label) => ({
      id: label.id,
      name: label.name,
      type: label.type,
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(labels, null, 2) }],
    };
  }

  private async trashMessage(args: Record<string, unknown>) {
    const messageId = args.messageId as string;

    await this.gmail!.users.messages.trash({
      userId: "me",
      id: messageId,
    });

    return {
      content: [{ type: "text", text: JSON.stringify({ success: true, messageId }, null, 2) }],
    };
  }

  private async markAsRead(args: Record<string, unknown>) {
    return await this.modifyLabels({
      messageId: args.messageId,
      removeLabelIds: ["UNREAD"],
    });
  }

  private async markAsUnread(args: Record<string, unknown>) {
    return await this.modifyLabels({
      messageId: args.messageId,
      addLabelIds: ["UNREAD"],
    });
  }

  private async getThread(args: Record<string, unknown>) {
    const threadId = args.threadId as string;

    const response = await this.gmail!.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    });

    const thread = response.data;
    const messages = thread.messages?.map((msg) => ({
      id: msg.id,
      from: this.getHeader(msg.payload?.headers, "From"),
      to: this.getHeader(msg.payload?.headers, "To"),
      subject: this.getHeader(msg.payload?.headers, "Subject"),
      date: this.getHeader(msg.payload?.headers, "Date"),
      body: this.getMessageBody(msg.payload),
    }));

    return {
      content: [{ type: "text", text: JSON.stringify({ threadId, messages }, null, 2) }],
    };
  }

  private async replyToMessage(args: Record<string, unknown>) {
    const messageId = args.messageId as string;
    const body = args.body as string;
    const replyAll = args.replyAll as boolean | undefined;

    const original = await this.gmail!.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });

    const headers = original.data.payload?.headers;
    const from = this.getHeader(headers, "From");
    const to = this.getHeader(headers, "To");
    const cc = this.getHeader(headers, "Cc");
    const subject = this.getHeader(headers, "Subject");
    const messageIdHeader = this.getHeader(headers, "Message-ID");
    const references = this.getHeader(headers, "References");

    const replySubject = subject.startsWith("Re:") ? subject : `Re: ${subject}`;
    const replyTo = replyAll ? [from, ...to.split(","), ...cc.split(",")].filter(Boolean).join(",") : from;

    const raw = this.createRawMessage(
      replyTo,
      replySubject,
      body,
      undefined,
      undefined,
      original.data.threadId!,
      references ? `${references} ${messageIdHeader}` : messageIdHeader,
      messageIdHeader
    );

    const response = await this.gmail!.users.messages.send({
      userId: "me",
      requestBody: {
        raw,
        threadId: original.data.threadId,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, messageId: response.data.id }, null, 2),
        },
      ],
    };
  }

  private async createDraft(args: Record<string, unknown>) {
    const to = args.to as string;
    const subject = args.subject as string;
    const body = args.body as string;

    const raw = this.createRawMessage(to, subject, body);

    const response = await this.gmail!.users.drafts.create({
      userId: "me",
      requestBody: {
        message: { raw },
      },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, draftId: response.data.id }, null, 2),
        },
      ],
    };
  }

  private async listDrafts(args: Record<string, unknown>) {
    const maxResults = (args.maxResults as number) || 10;

    const response = await this.gmail!.users.drafts.list({
      userId: "me",
      maxResults,
    });

    const drafts = response.data.drafts || [];
    const results = [];

    for (const draft of drafts) {
      const details = await this.gmail!.users.drafts.get({
        userId: "me",
        id: draft.id!,
        format: "metadata",
      });

      const headers = details.data.message?.payload?.headers;
      results.push({
        id: draft.id,
        messageId: details.data.message?.id,
        to: this.getHeader(headers, "To"),
        subject: this.getHeader(headers, "Subject"),
        snippet: details.data.message?.snippet,
      });
    }

    return {
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
    };
  }

  private async getDraft(args: Record<string, unknown>) {
    const draftId = args.draftId as string;

    const response = await this.gmail!.users.drafts.get({
      userId: "me",
      id: draftId,
      format: "full",
    });

    const draft = response.data;
    const headers = draft.message?.payload?.headers;
    const body = this.getMessageBody(draft.message?.payload);

    const result = {
      id: draft.id,
      messageId: draft.message?.id,
      to: this.getHeader(headers, "To"),
      cc: this.getHeader(headers, "Cc"),
      subject: this.getHeader(headers, "Subject"),
      body,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  private async updateDraft(args: Record<string, unknown>) {
    const draftId = args.draftId as string;
    const to = args.to as string;
    const subject = args.subject as string;
    const body = args.body as string;

    const raw = this.createRawMessage(to, subject, body);

    const response = await this.gmail!.users.drafts.update({
      userId: "me",
      id: draftId,
      requestBody: {
        message: { raw },
      },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, draftId: response.data.id }, null, 2),
        },
      ],
    };
  }

  private async sendDraft(args: Record<string, unknown>) {
    const draftId = args.draftId as string;

    const response = await this.gmail!.users.drafts.send({
      userId: "me",
      requestBody: {
        id: draftId,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, messageId: response.data.id }, null, 2),
        },
      ],
    };
  }

  private async deleteDraft(args: Record<string, unknown>) {
    const draftId = args.draftId as string;

    await this.gmail!.users.drafts.delete({
      userId: "me",
      id: draftId,
    });

    return {
      content: [{ type: "text", text: JSON.stringify({ success: true, draftId }, null, 2) }],
    };
  }

  private getAttachments(payload: gmail_v1.Schema$MessagePart | undefined): Array<{ id: string; filename: string; mimeType: string; size: number }> {
    const attachments: Array<{ id: string; filename: string; mimeType: string; size: number }> = [];

    if (!payload) return attachments;

    if (payload.body?.attachmentId && payload.filename) {
      attachments.push({
        id: payload.body.attachmentId,
        filename: payload.filename,
        mimeType: payload.mimeType || "application/octet-stream",
        size: payload.body.size || 0,
      });
    }

    if (payload.parts) {
      for (const part of payload.parts) {
        attachments.push(...this.getAttachments(part));
      }
    }

    return attachments;
  }

  private async listAttachments(args: Record<string, unknown>) {
    const messageId = args.messageId as string;

    const response = await this.gmail!.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });

    const attachments = this.getAttachments(response.data.payload);

    return {
      content: [{ type: "text", text: JSON.stringify(attachments, null, 2) }],
    };
  }

  private async getAttachment(args: Record<string, unknown>) {
    const messageId = args.messageId as string;
    const attachmentId = args.attachmentId as string;

    const response = await this.gmail!.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            attachmentId,
            size: response.data.size,
            data: response.data.data, // base64 encoded
          }, null, 2),
        },
      ],
    };
  }

  private async archiveMessage(args: Record<string, unknown>) {
    return await this.modifyLabels({
      messageId: args.messageId,
      removeLabelIds: ["INBOX"],
    });
  }

  private async unarchiveMessage(args: Record<string, unknown>) {
    return await this.modifyLabels({
      messageId: args.messageId,
      addLabelIds: ["INBOX"],
    });
  }

  private async untrashMessage(args: Record<string, unknown>) {
    const messageId = args.messageId as string;

    await this.gmail!.users.messages.untrash({
      userId: "me",
      id: messageId,
    });

    return {
      content: [{ type: "text", text: JSON.stringify({ success: true, messageId }, null, 2) }],
    };
  }

  private async deleteMessage(args: Record<string, unknown>) {
    const messageId = args.messageId as string;

    await this.gmail!.users.messages.delete({
      userId: "me",
      id: messageId,
    });

    return {
      content: [{ type: "text", text: JSON.stringify({ success: true, messageId, deleted: true }, null, 2) }],
    };
  }

  private async createLabel(args: Record<string, unknown>) {
    const name = args.name as string;
    const labelListVisibility = (args.labelListVisibility as string) || "labelShow";
    const messageListVisibility = (args.messageListVisibility as string) || "show";

    const response = await this.gmail!.users.labels.create({
      userId: "me",
      requestBody: {
        name,
        labelListVisibility,
        messageListVisibility,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            labelId: response.data.id,
            name: response.data.name,
          }, null, 2),
        },
      ],
    };
  }

  private async updateLabel(args: Record<string, unknown>) {
    const labelId = args.labelId as string;
    const name = args.name as string;

    const response = await this.gmail!.users.labels.update({
      userId: "me",
      id: labelId,
      requestBody: {
        name,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            labelId: response.data.id,
            name: response.data.name,
          }, null, 2),
        },
      ],
    };
  }

  private async deleteLabel(args: Record<string, unknown>) {
    const labelId = args.labelId as string;

    await this.gmail!.users.labels.delete({
      userId: "me",
      id: labelId,
    });

    return {
      content: [{ type: "text", text: JSON.stringify({ success: true, labelId, deleted: true }, null, 2) }],
    };
  }

  private async getProfile() {
    const response = await this.gmail!.users.getProfile({
      userId: "me",
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            emailAddress: response.data.emailAddress,
            messagesTotal: response.data.messagesTotal,
            threadsTotal: response.data.threadsTotal,
            historyId: response.data.historyId,
          }, null, 2),
        },
      ],
    };
  }

  private async forwardMessage(args: Record<string, unknown>) {
    const messageId = args.messageId as string;
    const to = args.to as string;
    const additionalMessage = args.additionalMessage as string | undefined;

    const original = await this.gmail!.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });

    const headers = original.data.payload?.headers;
    const subject = this.getHeader(headers, "Subject");
    const originalFrom = this.getHeader(headers, "From");
    const originalDate = this.getHeader(headers, "Date");
    const originalBody = this.getMessageBody(original.data.payload);

    const forwardSubject = subject.startsWith("Fwd:") ? subject : `Fwd: ${subject}`;
    const forwardBody = `${additionalMessage ? additionalMessage + "\n\n" : ""}---------- Forwarded message ----------\nFrom: ${originalFrom}\nDate: ${originalDate}\nSubject: ${subject}\n\n${originalBody}`;

    const raw = this.createRawMessage(to, forwardSubject, forwardBody);

    const response = await this.gmail!.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, messageId: response.data.id }, null, 2),
        },
      ],
    };
  }

  private async starMessage(args: Record<string, unknown>) {
    return await this.modifyLabels({
      messageId: args.messageId,
      addLabelIds: ["STARRED"],
    });
  }

  private async unstarMessage(args: Record<string, unknown>) {
    return await this.modifyLabels({
      messageId: args.messageId,
      removeLabelIds: ["STARRED"],
    });
  }

  private async batchModify(args: Record<string, unknown>) {
    const messageIds = args.messageIds as string[];
    const addLabelIds = args.addLabelIds as string[] | undefined;
    const removeLabelIds = args.removeLabelIds as string[] | undefined;

    await this.gmail!.users.messages.batchModify({
      userId: "me",
      requestBody: {
        ids: messageIds,
        addLabelIds,
        removeLabelIds,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, modifiedCount: messageIds.length }, null, 2),
        },
      ],
    };
  }

  private async batchDelete(args: Record<string, unknown>) {
    const messageIds = args.messageIds as string[];

    await this.gmail!.users.messages.batchDelete({
      userId: "me",
      requestBody: {
        ids: messageIds,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, deletedCount: messageIds.length }, null, 2),
        },
      ],
    };
  }

  // Google Photos via Drive API - photos are stored in Drive
  private async photosListAlbums(args: Record<string, unknown>) {
    const pageSize = (args.pageSize as number) || 20;
    const pageToken = args.pageToken as string | undefined;

    // Find folders in Google Photos space
    const response = await this.drive!.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and 'root' in parents",
      pageSize,
      pageToken,
      fields: "nextPageToken, files(id, name, createdTime, modifiedTime)",
          });

    const albums = response.data.files?.map((folder) => ({
      id: folder.id,
      title: folder.name,
      createdTime: folder.createdTime,
      modifiedTime: folder.modifiedTime,
    })) || [];

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ albums, nextPageToken: response.data.nextPageToken }, null, 2),
      }],
    };
  }

  private async photosGetAlbum(args: Record<string, unknown>) {
    const albumId = args.albumId as string;

    const response = await this.drive!.files.get({
      fileId: albumId,
      fields: "id, name, createdTime, modifiedTime, webViewLink",
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          id: response.data.id,
          title: response.data.name,
          createdTime: response.data.createdTime,
          modifiedTime: response.data.modifiedTime,
          webViewLink: response.data.webViewLink,
        }, null, 2),
      }],
    };
  }

  private async photosListMedia(args: Record<string, unknown>) {
    const pageSize = (args.pageSize as number) || 25;
    const pageToken = args.pageToken as string | undefined;
    const folderId = args.albumId as string | undefined;

    let query = "(mimeType contains 'image/' or mimeType contains 'video/')";
    if (folderId) {
      query += ` and '${folderId}' in parents`;
    }

    const response = await this.drive!.files.list({
      q: query,
      pageSize,
      pageToken,
      fields: "nextPageToken, files(id, name, mimeType, createdTime, modifiedTime, size, thumbnailLink, webContentLink, imageMediaMetadata, videoMediaMetadata)",
            orderBy: "createdTime desc",
    });

    const items = response.data.files?.map((file) => ({
      id: file.id,
      filename: file.name,
      mimeType: file.mimeType,
      createdTime: file.createdTime,
      modifiedTime: file.modifiedTime,
      size: file.size,
      thumbnailLink: file.thumbnailLink,
      webContentLink: file.webContentLink,
      imageMetadata: file.imageMediaMetadata,
      videoMetadata: file.videoMediaMetadata,
    })) || [];

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ mediaItems: items, nextPageToken: response.data.nextPageToken }, null, 2),
      }],
    };
  }

  private async photosGetMedia(args: Record<string, unknown>) {
    const mediaItemId = args.mediaItemId as string;

    const response = await this.drive!.files.get({
      fileId: mediaItemId,
      fields: "id, name, mimeType, createdTime, modifiedTime, size, thumbnailLink, webContentLink, webViewLink, imageMediaMetadata, videoMediaMetadata",
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          id: response.data.id,
          filename: response.data.name,
          mimeType: response.data.mimeType,
          createdTime: response.data.createdTime,
          size: response.data.size,
          thumbnailLink: response.data.thumbnailLink,
          webContentLink: response.data.webContentLink,
          webViewLink: response.data.webViewLink,
          imageMetadata: response.data.imageMediaMetadata,
          videoMetadata: response.data.videoMediaMetadata,
        }, null, 2),
      }],
    };
  }

  private async photosSearch(args: Record<string, unknown>) {
    const pageSize = (args.pageSize as number) || 25;
    const query = args.query as string | undefined;
    const mimeType = args.mimeType as string | undefined;

    let q = "(mimeType contains 'image/' or mimeType contains 'video/')";
    if (query) {
      q += ` and fullText contains '${query}'`;
    }
    if (mimeType) {
      q = `mimeType contains '${mimeType}'`;
    }

    const response = await this.drive!.files.list({
      q,
      pageSize,
      fields: "nextPageToken, files(id, name, mimeType, createdTime, thumbnailLink, webViewLink)",
            orderBy: "createdTime desc",
    });

    const items = response.data.files?.map((file) => ({
      id: file.id,
      filename: file.name,
      mimeType: file.mimeType,
      createdTime: file.createdTime,
      thumbnailLink: file.thumbnailLink,
      webViewLink: file.webViewLink,
    })) || [];

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ mediaItems: items, nextPageToken: response.data.nextPageToken }, null, 2),
      }],
    };
  }

  private async photosCreateAlbum(args: Record<string, unknown>) {
    const title = args.title as string;

    const response = await this.drive!.files.create({
      requestBody: {
        name: title,
        mimeType: "application/vnd.google-apps.folder",
      },
      fields: "id, name, webViewLink",
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          id: response.data.id,
          title: response.data.name,
          webViewLink: response.data.webViewLink,
        }, null, 2),
      }],
    };
  }

  private async photosAddToAlbum(args: Record<string, unknown>) {
    const albumId = args.albumId as string;
    const mediaItemIds = args.mediaItemIds as string[];

    const results = [];
    for (const fileId of mediaItemIds) {
      // Get current parents
      const file = await this.drive!.files.get({
        fileId,
        fields: "parents",
      });

      // Add to new folder
      await this.drive!.files.update({
        fileId,
        addParents: albumId,
        fields: "id, parents",
      });
      results.push(fileId);
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ success: true, albumId, addedCount: results.length }, null, 2),
      }],
    };
  }

  private async photosShareAlbum(args: Record<string, unknown>) {
    const albumId = args.albumId as string;

    // Create a permission for anyone with link
    await this.drive!.permissions.create({
      fileId: albumId,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });

    // Get the web view link
    const file = await this.drive!.files.get({
      fileId: albumId,
      fields: "webViewLink",
    });

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          shareUrl: file.data.webViewLink,
        }, null, 2),
      }],
    };
  }

  private async photosListSharedAlbums(args: Record<string, unknown>) {
    const pageSize = (args.pageSize as number) || 20;
    const pageToken = args.pageToken as string | undefined;

    const response = await this.drive!.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and sharedWithMe=true",
      pageSize,
      pageToken,
      fields: "nextPageToken, files(id, name, createdTime, webViewLink, sharingUser)",
    });

    const albums = response.data.files?.map((folder) => ({
      id: folder.id,
      title: folder.name,
      createdTime: folder.createdTime,
      webViewLink: folder.webViewLink,
      sharedBy: folder.sharingUser,
    })) || [];

    return {
      content: [{
        type: "text",
        text: JSON.stringify({ albums, nextPageToken: response.data.nextPageToken }, null, 2),
      }],
    };
  }

  // Video Analysis Methods (Ollama + FFmpeg)

  private async downloadDriveFile(fileId: string): Promise<string> {
    const tmpDir = "/tmp/gmail-mcp-videos";
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Get file metadata
    const metadata = await this.drive!.files.get({
      fileId,
      fields: "name, mimeType",
    });

    const fileName = metadata.data.name || `video_${fileId}`;
    const filePath = path.join(tmpDir, fileName);

    // Download the file
    const response = await this.drive!.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" }
    );

    const dest = fs.createWriteStream(filePath);
    await new Promise((resolve, reject) => {
      (response.data as NodeJS.ReadableStream)
        .pipe(dest)
        .on("finish", resolve)
        .on("error", reject);
    });

    return filePath;
  }

  private async videoGetInfo(args: Record<string, unknown>) {
    let filePath = args.filePath as string | undefined;
    const driveFileId = args.driveFileId as string | undefined;

    if (driveFileId && !filePath) {
      filePath = await this.downloadDriveFile(driveFileId);
    }

    if (!filePath) {
      throw new Error("Either filePath or driveFileId is required");
    }

    // Use FFprobe to get video info
    const { stdout } = await execAsync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`
    );

    const info = JSON.parse(stdout);
    const videoStream = info.streams?.find((s: any) => s.codec_type === "video");
    const audioStream = info.streams?.find((s: any) => s.codec_type === "audio");

    const result = {
      filename: path.basename(filePath),
      duration: info.format?.duration ? parseFloat(info.format.duration).toFixed(2) + "s" : "unknown",
      size: info.format?.size ? (parseInt(info.format.size) / (1024 * 1024)).toFixed(2) + " MB" : "unknown",
      bitrate: info.format?.bit_rate ? (parseInt(info.format.bit_rate) / 1000).toFixed(0) + " kbps" : "unknown",
      video: videoStream ? {
        codec: videoStream.codec_name,
        width: videoStream.width,
        height: videoStream.height,
        fps: videoStream.r_frame_rate,
      } : null,
      audio: audioStream ? {
        codec: audioStream.codec_name,
        channels: audioStream.channels,
        sampleRate: audioStream.sample_rate,
      } : null,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  private async videoExtractFrame(args: Record<string, unknown>) {
    let filePath = args.filePath as string | undefined;
    const driveFileId = args.driveFileId as string | undefined;
    const timestamp = (args.timestamp as string) || "00:00:01";

    if (driveFileId && !filePath) {
      filePath = await this.downloadDriveFile(driveFileId);
    }

    if (!filePath) {
      throw new Error("Either filePath or driveFileId is required");
    }

    const outputPath = `/tmp/gmail-mcp-videos/frame_${Date.now()}.jpg`;

    await execAsync(
      `ffmpeg -y -ss ${timestamp} -i "${filePath}" -vframes 1 -q:v 2 "${outputPath}"`
    );

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          framePath: outputPath,
          timestamp,
          message: "Frame extracted. Use video_analyze_frame to analyze it.",
        }, null, 2),
      }],
    };
  }

  private async videoAnalyzeFrame(args: Record<string, unknown>) {
    const imagePath = args.imagePath as string;
    const prompt = (args.prompt as string) || "Describe this image in detail";
    const model = (args.model as string) || "llava";

    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image not found: ${imagePath}`);
    }

    // Read image as base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString("base64");

    // Call Ollama API
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        images: [base64Image],
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const result = await response.json() as { response: string };

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          model,
          prompt,
          analysis: result.response,
        }, null, 2),
      }],
    };
  }

  private async videoAnalyze(args: Record<string, unknown>) {
    let filePath = args.filePath as string | undefined;
    const driveFileId = args.driveFileId as string | undefined;
    const prompt = (args.prompt as string) || "Describe what you see in this video frame";
    const frameCount = (args.frameCount as number) || 3;
    const model = (args.model as string) || "llava";

    if (driveFileId && !filePath) {
      filePath = await this.downloadDriveFile(driveFileId);
    }

    if (!filePath) {
      throw new Error("Either filePath or driveFileId is required");
    }

    // Get video duration
    const { stdout: durationOutput } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    );
    const duration = parseFloat(durationOutput.trim());

    // Calculate timestamps for frames
    const timestamps: number[] = [];
    if (frameCount === 1) {
      timestamps.push(duration / 2);
    } else {
      for (let i = 0; i < frameCount; i++) {
        timestamps.push((duration / (frameCount + 1)) * (i + 1));
      }
    }

    const analyses: Array<{ timestamp: string; analysis: string }> = [];

    for (const ts of timestamps) {
      const outputPath = `/tmp/gmail-mcp-videos/frame_${Date.now()}_${ts.toFixed(0)}.jpg`;
      const tsStr = new Date(ts * 1000).toISOString().substr(11, 8);

      // Extract frame
      await execAsync(
        `ffmpeg -y -ss ${ts} -i "${filePath}" -vframes 1 -q:v 2 "${outputPath}"`
      );

      // Analyze with Ollama
      const imageBuffer = fs.readFileSync(outputPath);
      const base64Image = imageBuffer.toString("base64");

      const response = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: `${prompt} (Frame at ${tsStr})`,
          images: [base64Image],
          stream: false,
        }),
      });

      if (response.ok) {
        const result = await response.json() as { response: string };
        analyses.push({
          timestamp: tsStr,
          analysis: result.response,
        });
      }

      // Cleanup frame
      fs.unlinkSync(outputPath);
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          video: path.basename(filePath),
          duration: duration.toFixed(2) + "s",
          model,
          framesAnalyzed: analyses.length,
          analyses,
        }, null, 2),
      }],
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Gmail MCP Server running on stdio");
  }
}

const server = new GmailMCPServer();
server.run().catch(console.error);
