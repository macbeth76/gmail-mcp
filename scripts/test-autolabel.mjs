import { google } from "googleapis";
import * as fs from "fs";
import * as path from "path";

const CONFIG_DIR = path.join(process.env.HOME, ".gmail-mcp");
const CREDENTIALS_PATH = path.join(CONFIG_DIR, "credentials.json");
const TOKEN_PATH = path.join(CONFIG_DIR, "token.json");

async function main() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
  oauth2Client.setCredentials(token);

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  console.log("=== AI Auto-Labeling Test ===\n");

  // Get 5 recent emails
  const response = await gmail.users.messages.list({
    userId: "me",
    maxResults: 5,
  });

  const messages = response.data.messages || [];

  for (const msg of messages) {
    const details = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "full",
    });

    const headers = details.data.payload?.headers || [];
    const from = headers.find(h => h.name === "From")?.value || "";
    const subject = headers.find(h => h.name === "Subject")?.value || "";

    // Get body
    let body = "";
    const payload = details.data.payload;
    if (payload?.body?.data) {
      body = Buffer.from(payload.body.data, "base64").toString("utf-8");
    } else if (payload?.parts) {
      const textPart = payload.parts.find(p => p.mimeType === "text/plain");
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
      }
    }

    console.log(`Email: ${subject.substring(0, 50)}`);
    console.log(`From: ${from.substring(0, 50)}`);

    // Call Ollama for classification
    const prompt = `Classify this email and suggest labels.

From: ${from}
Subject: ${subject}
Body (first 300 chars): ${body.substring(0, 300)}

Categories: Newsletter, Receipt, Work, Personal, Social, Finance, Travel, Shopping, Notification, Spam, Important

Respond with JSON only: {"category": "...", "labels": ["...", "..."], "reason": "..."}`;

    try {
      const aiResponse = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama2",
          prompt,
          stream: false,
        }),
      });

      if (aiResponse.ok) {
        const result = await aiResponse.json();
        const jsonMatch = result.response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const analysis = JSON.parse(jsonMatch[0]);
          console.log(`AI Category: ${analysis.category}`);
          console.log(`Suggested Labels: ${analysis.labels?.join(", ")}`);
          console.log(`Reason: ${analysis.reason}`);
        }
      }
    } catch (e) {
      console.log(`AI Error: ${e.message}`);
    }

    console.log("\n---\n");
  }
}

main().catch(console.error);
