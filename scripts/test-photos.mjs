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

  const drive = google.drive({ version: "v3", auth: oauth2Client });

  console.log("=== Testing Photos (via Drive API) ===\n");

  // List photos/videos
  console.log("Recent Photos/Videos:\n");
  const mediaResponse = await drive.files.list({
    q: "(mimeType contains 'image/' or mimeType contains 'video/')",
    pageSize: 10,
    fields: "files(id, name, mimeType, size, createdTime)",
    orderBy: "createdTime desc",
  });

  const media = mediaResponse.data.files || [];
  media.forEach((file, i) => {
    const size = file.size ? (parseInt(file.size) / (1024 * 1024)).toFixed(2) + " MB" : "?";
    const type = file.mimeType?.includes("video") ? "🎬" : "📷";
    console.log(`${i + 1}. ${type} ${file.name}`);
    console.log(`   Size: ${size} | Created: ${file.createdTime?.split("T")[0]}`);
    console.log(`   ID: ${file.id}\n`);
  });

  // List folders (albums)
  console.log("\n=== Folders (Albums) ===\n");
  const folderResponse = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.folder'",
    pageSize: 10,
    fields: "files(id, name, createdTime)",
    orderBy: "createdTime desc",
  });

  const folders = folderResponse.data.files || [];
  folders.forEach((folder, i) => {
    console.log(`${i + 1}. 📁 ${folder.name}`);
    console.log(`   ID: ${folder.id}\n`);
  });

  // Return a video ID for testing
  const video = media.find(m => m.mimeType?.includes("video"));
  if (video) {
    console.log("\n=== Video for testing ===");
    console.log(`Name: ${video.name}`);
    console.log(`ID: ${video.id}`);
  }
}

main().catch(console.error);
