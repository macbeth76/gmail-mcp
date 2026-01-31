#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { google, gmail_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import * as fs from "fs";
import * as path from "path";

// Gmail scopes required
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
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
];

class GmailMCPServer {
  private server: Server;
  private oauth2Client: OAuth2Client | null = null;
  private gmail: gmail_v1.Gmail | null = null;

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

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Gmail MCP Server running on stdio");
  }
}

const server = new GmailMCPServer();
server.run().catch(console.error);
