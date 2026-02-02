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

  // Test with Moe's email
  const messageId = "19c1e71f5ba3cd9d";

  console.log("Finding unsubscribe link for message:", messageId, "\n");

  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const headers = response.data.payload?.headers || [];
  const from = headers.find(h => h.name === "From")?.value || "";
  const subject = headers.find(h => h.name === "Subject")?.value || "";
  const listUnsub = headers.find(h => h.name === "List-Unsubscribe")?.value || "";

  console.log("From:", from);
  console.log("Subject:", subject);
  console.log("\nList-Unsubscribe Header:", listUnsub || "(none)");

  // Extract links
  if (listUnsub) {
    const httpMatch = listUnsub.match(/<(https?:\/\/[^>]+)>/);
    const mailtoMatch = listUnsub.match(/<(mailto:[^>]+)>/);

    if (httpMatch) console.log("\nHTTP Unsubscribe:", httpMatch[1]);
    if (mailtoMatch) console.log("Mailto Unsubscribe:", mailtoMatch[1]);
  }
}

main().catch(console.error);
