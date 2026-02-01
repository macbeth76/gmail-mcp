import { google } from "googleapis";
import * as fs from "fs";
import * as path from "path";

const TOKEN_PATH = path.join(process.env.HOME, ".gmail-mcp", "token.json");
const CREDENTIALS_PATH = path.join(process.env.HOME, ".gmail-mcp", "credentials.json");

async function trashPromotions() {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
  oauth2Client.setCredentials(token);
  
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  
  let totalTrashed = 0;
  let pageToken = null;
  
  console.log("Starting to trash promotional emails...\n");
  
  do {
    const response = await gmail.users.messages.list({
      userId: "me",
      q: "category:promotions",
      maxResults: 100,
      pageToken: pageToken,
    });
    
    const messages = response.data.messages || [];
    if (messages.length === 0) break;
    
    for (const msg of messages) {
      try {
        await gmail.users.messages.trash({ userId: "me", id: msg.id });
        totalTrashed++;
        if (totalTrashed % 50 === 0) {
          console.log(`Trashed ${totalTrashed} emails...`);
        }
      } catch (e) {
        console.error(`Failed to trash ${msg.id}: ${e.message}`);
      }
    }
    
    pageToken = response.data.nextPageToken;
  } while (pageToken);
  
  console.log(`\nDone! Trashed ${totalTrashed} promotional emails.`);
}

trashPromotions().catch(console.error);
