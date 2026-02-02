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

  console.log("Finding all subscriptions...\n");

  const response = await gmail.users.messages.list({
    userId: "me",
    maxResults: 100,
    q: "unsubscribe",
  });

  const messages = response.data.messages || [];
  const subscriptions = new Map();

  for (const msg of messages) {
    const details = await gmail.users.messages.get({
      userId: "me",
      id: msg.id,
      format: "metadata",
      metadataHeaders: ["From", "List-Unsubscribe"],
    });

    const headers = details.data.payload?.headers || [];
    const from = headers.find(h => h.name === "From")?.value || "";
    const listUnsub = headers.find(h => h.name === "List-Unsubscribe")?.value || "";

    const emailMatch = from.match(/<(.+?)>/) || from.match(/(\S+@\S+)/);
    const email = emailMatch ? emailMatch[1].toLowerCase() : from.toLowerCase();
    const domain = email.split("@")[1] || email;

    if (!subscriptions.has(domain) && listUnsub) {
      // Extract HTTP link
      const httpMatch = listUnsub.match(/<(https?:\/\/[^>]+)>/);
      if (httpMatch) {
        subscriptions.set(domain, {
          sender: from.substring(0, 40),
          domain,
          messageId: msg.id,
          unsubLink: httpMatch[1],
        });
      }
    }
  }

  const subs = Array.from(subscriptions.values());
  console.log(`Found ${subs.length} subscriptions with unsubscribe links.\n`);
  console.log("Unsubscribing...\n");

  let success = 0;
  let failed = 0;

  for (const sub of subs) {
    process.stdout.write(`${sub.domain.padEnd(35)} `);

    try {
      const response = await fetch(sub.unsubLink, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      });

      if (response.ok || response.status === 302 || response.status === 301) {
        console.log("✓ Unsubscribed");
        success++;
      } else {
        console.log(`✗ Failed (${response.status})`);
        failed++;
      }
    } catch (error) {
      console.log(`✗ Error: ${error.message.substring(0, 30)}`);
      failed++;
    }

    // Small delay to be nice to servers
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n========================================`);
  console.log(`Results: ${success} unsubscribed, ${failed} failed`);
  console.log(`========================================`);
}

main().catch(console.error);
