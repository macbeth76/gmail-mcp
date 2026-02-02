import { google } from "googleapis";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

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

  const fileId = "1LwJ5QJ1MIUBjgrq_PLgNA0OBGQiBnk4w"; // Joe Drunk On Birthday.mp4
  const tmpDir = "/tmp/gmail-mcp-videos";

  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  console.log("=== Video Analysis Test ===\n");
  console.log("1. Downloading video from Drive...");

  const metadata = await drive.files.get({ fileId, fields: "name, size" });
  console.log(`   Name: ${metadata.data.name}`);
  console.log(`   Size: ${(parseInt(metadata.data.size) / (1024 * 1024)).toFixed(2)} MB`);

  const filePath = path.join(tmpDir, metadata.data.name);

  // Download if not exists
  if (!fs.existsSync(filePath)) {
    const response = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" }
    );

    const dest = fs.createWriteStream(filePath);
    await new Promise((resolve, reject) => {
      response.data.pipe(dest).on("finish", resolve).on("error", reject);
    });
    console.log("   Downloaded!\n");
  } else {
    console.log("   Already cached.\n");
  }

  console.log("2. Getting video info (FFprobe)...");
  try {
    const info = execSync(`ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`);
    const data = JSON.parse(info.toString());
    const video = data.streams?.find(s => s.codec_type === "video");
    const audio = data.streams?.find(s => s.codec_type === "audio");

    console.log(`   Duration: ${parseFloat(data.format?.duration).toFixed(1)}s`);
    console.log(`   Resolution: ${video?.width}x${video?.height}`);
    console.log(`   Video Codec: ${video?.codec_name}`);
    console.log(`   Audio: ${audio?.codec_name || "none"}\n`);
  } catch (e) {
    console.log("   FFprobe not available\n");
  }

  console.log("3. Extracting frame for analysis...");
  const framePath = path.join(tmpDir, "test_frame.jpg");
  try {
    execSync(`ffmpeg -y -ss 5 -i "${filePath}" -vframes 1 -q:v 2 "${framePath}" 2>/dev/null`);
    console.log(`   Frame saved: ${framePath}\n`);
  } catch (e) {
    console.log("   FFmpeg not available\n");
  }

  console.log("4. Analyzing frame with Ollama LLaVA...");
  try {
    const imageBuffer = fs.readFileSync(framePath);
    const base64Image = imageBuffer.toString("base64");

    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llava",
        prompt: "Describe what you see in this image. What's happening?",
        images: [base64Image],
        stream: false,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`   Analysis: ${result.response}\n`);
    } else {
      console.log("   Ollama not running or LLaVA not installed\n");
    }
  } catch (e) {
    console.log(`   Error: ${e.message}\n`);
  }

  console.log("5. Transcribing audio with Whisper...");
  try {
    const audioPath = path.join(tmpDir, "test_audio.wav");
    execSync(`ffmpeg -y -i "${filePath}" -ar 16000 -ac 1 -c:a pcm_s16le "${audioPath}" 2>/dev/null`);

    const modelPath = path.join(process.env.HOME, ".whisper-models", "ggml-base.en.bin");
    execSync(`whisper-cli -m "${modelPath}" -l en -otxt -of /tmp/transcript "${audioPath}" 2>/dev/null`);

    const transcript = fs.readFileSync("/tmp/transcript.txt", "utf-8").trim();
    console.log(`   Transcript: ${transcript.substring(0, 500)}${transcript.length > 500 ? "..." : ""}\n`);

    // Cleanup
    fs.unlinkSync(audioPath);
    fs.unlinkSync("/tmp/transcript.txt");
  } catch (e) {
    console.log(`   Whisper error: ${e.message}\n`);
  }

  console.log("=== Test Complete ===");
}

main().catch(console.error);
