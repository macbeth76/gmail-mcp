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

  console.log("Scanning for subscriptions...\n");

  const response = await gmail.users.messages.list({
    userId: "me",
    maxResults: 50,
    q: "unsubscribe",
  });

  const messages = response.data.messages || [];
  const subscriptions = new Map();

  for (const msg of messages) {
    const details = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "metadata",
      metadataHeaders: ["From", "Subject", "List-Unsubscribe"],
    });

    const headers = details.data.payload?.headers || [];
    const from = headers.find(h => h.name === "From")?.value || "";
    const listUnsub = headers.find(h => h.name === "List-Unsubscribe")?.value || "";

    const emailMatch = from.match(/<(.+?)>/) || from.match(/(\S+@\S+)/);
    const email = emailMatch ? emailMatch[1].toLowerCase() : from.toLowerCase();
    const domain = email.split("@")[1] || email;

    if (!subscriptions.has(domain)) {
      subscriptions.set(domain, {
        sender: from.substring(0, 50),
        domain,
        count: 0,
        messageId: msg.id,
        hasHeaderUnsub: !!listUnsub,
      });
    }
    subscriptions.get(domain).count++;
  }

  const sorted = Array.from(subscriptions.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  console.log("Top Subscriptions:\n");
  sorted.forEach((s, i) => {
    console.log(`${i+1}. ${s.domain} (${s.count} emails) ${s.hasHeaderUnsub ? "[Easy Unsub]" : ""}`);
    console.log(`   From: ${s.sender}`);
    console.log(`   ID: ${s.messageId}\n`);
  });
}

main().catch(console.error);
