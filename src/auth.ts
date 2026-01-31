#!/usr/bin/env node

import { google } from "googleapis";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import * as http from "http";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
];

const CONFIG_DIR = path.join(process.env.HOME || "", ".gmail-mcp");
const CREDENTIALS_PATH = path.join(CONFIG_DIR, "credentials.json");
const TOKEN_PATH = path.join(CONFIG_DIR, "token.json");

async function authenticate(): Promise<void> {
  // Ensure config directory exists
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    console.log(`Created config directory: ${CONFIG_DIR}`);
  }

  // Check for credentials file
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.log(`
=== Gmail MCP Server Setup ===

Credentials file not found at: ${CREDENTIALS_PATH}

To set up Gmail API access:

1. Go to https://console.cloud.google.com/
2. Create a new project or select an existing one
3. Enable the Gmail API:
   - Go to "APIs & Services" > "Library"
   - Search for "Gmail API" and enable it
4. Create OAuth2 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Select "Desktop app" as the application type
   - Download the JSON file
5. Save the downloaded file as: ${CREDENTIALS_PATH}
6. Run this script again

`);
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf-8"));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

  const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    "http://localhost:3000/oauth2callback"
  );

  // Check if token already exists
  if (fs.existsSync(TOKEN_PATH)) {
    console.log("Token already exists. Do you want to re-authenticate? (y/n)");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const answer = await new Promise<string>((resolve) => {
      rl.question("", (ans) => {
        rl.close();
        resolve(ans);
      });
    });

    if (answer.toLowerCase() !== "y") {
      console.log("Keeping existing token.");
      process.exit(0);
    }
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  console.log("\n=== Gmail OAuth2 Authentication ===\n");
  console.log("Opening browser for authentication...");
  console.log("\nIf browser doesn't open, visit this URL manually:");
  console.log(authUrl);
  console.log("\nWaiting for authentication callback...\n");

  // Start local server to receive OAuth callback
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, `http://localhost:3000`);

    if (url.pathname === "/oauth2callback") {
      const code = url.searchParams.get("code");

      if (code) {
        try {
          const { tokens } = await oauth2Client.getToken(code);
          oauth2Client.setCredentials(tokens);

          // Save the token
          fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
          console.log("Token saved successfully!");

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1>Authentication Successful!</h1>
                <p>You can close this window and return to the terminal.</p>
              </body>
            </html>
          `);

          setTimeout(() => {
            server.close();
            process.exit(0);
          }, 1000);
        } catch (error) {
          console.error("Error getting token:", error);
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end("<html><body><h1>Authentication Failed</h1></body></html>");
          server.close();
          process.exit(1);
        }
      } else {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<html><body><h1>No code received</h1></body></html>");
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  server.listen(3000, () => {
    // Try to open browser
    const { exec } = require("child_process");
    const platform = process.platform;

    if (platform === "darwin") {
      exec(`open "${authUrl}"`);
    } else if (platform === "win32") {
      exec(`start "" "${authUrl}"`);
    } else {
      exec(`xdg-open "${authUrl}"`);
    }
  });

  // Timeout after 5 minutes
  setTimeout(() => {
    console.log("Authentication timed out.");
    server.close();
    process.exit(1);
  }, 300000);
}

authenticate().catch(console.error);
