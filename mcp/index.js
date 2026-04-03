import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_URL = "https://olympus.adithyabhat.com";
const TOKEN_DIR = path.join(process.env.HOME, ".olympus");
const TOKEN_PATH = path.join(TOKEN_DIR, "token.json");
const CALLBACK_PORT = 9876;

// ---------------------------------------------------------------------------
// Load OAuth credentials from the project's .env.local
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const content = fs.readFileSync(envPath, "utf-8");
  const vars = {};
  for (const line of content.split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) vars[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return vars;
}

const env = loadEnv();
const CLIENT_ID = env.AUTH_GOOGLE_ID;
const CLIENT_SECRET = env.AUTH_GOOGLE_SECRET;

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------
function loadToken() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function saveToken(token) {
  fs.mkdirSync(TOKEN_DIR, { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
}

function isTokenExpired(token) {
  if (!token?.id_token) return true;
  try {
    const payload = JSON.parse(
      Buffer.from(token.id_token.split(".")[1], "base64url").toString()
    );
    // Expired if within 60 s of expiry
    return Date.now() >= payload.exp * 1000 - 60_000;
  } catch {
    return true;
  }
}

async function refreshTokens(token) {
  if (!token?.refresh_token) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  const updated = {
    ...token,
    id_token: data.id_token,
    access_token: data.access_token,
  };
  saveToken(updated);
  return updated;
}

async function getValidToken() {
  let token = loadToken();
  if (!token) return null;
  if (isTokenExpired(token)) {
    token = await refreshTokens(token);
  }
  return token;
}

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------
async function apiCall(endpoint, token) {
  const res = await fetch(`${APP_URL}${endpoint}`, {
    headers: { Authorization: `Bearer ${token.id_token}` },
  });
  return res.json();
}

// ---------------------------------------------------------------------------
// OAuth login flow — opens browser, listens for callback
// ---------------------------------------------------------------------------
function doLogin() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);
      if (url.pathname !== "/callback") return;

      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error || !code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>Login failed</h1><p>You can close this tab.</p>");
        server.close();
        reject(new Error(error || "No auth code received"));
        return;
      }

      try {
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            code,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            redirect_uri: `http://localhost:${CALLBACK_PORT}/callback`,
            grant_type: "authorization_code",
          }),
        });

        if (!tokenRes.ok) {
          const body = await tokenRes.text();
          throw new Error(`Token exchange failed (${tokenRes.status}): ${body}`);
        }

        const tokenData = await tokenRes.json();
        saveToken(tokenData);

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<h1>Login successful!</h1><p>You can close this tab and return to Claude.</p>"
        );
        server.close();
        resolve(tokenData);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "text/html" });
        res.end(`<h1>Login failed</h1><p>${err.message}</p>`);
        server.close();
        reject(err);
      }
    });

    server.listen(CALLBACK_PORT, () => {
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", CLIENT_ID);
      authUrl.searchParams.set(
        "redirect_uri",
        `http://localhost:${CALLBACK_PORT}/callback`
      );
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "openid email profile");
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");

      import("open").then((mod) => mod.default(authUrl.toString()));
    });

    setTimeout(() => {
      server.close();
      reject(new Error("Login timed out after 2 minutes"));
    }, 120_000);
  });
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------
const server = new McpServer({
  name: "olympus",
  version: "1.0.0",
});

server.tool(
  "olympus_login",
  "Authenticate with Google to access Olympus workout data. Run this if other tools say you're not logged in.",
  {},
  async () => {
    try {
      const existing = await getValidToken();
      if (existing) {
        return {
          content: [{ type: "text", text: "Already logged in with a valid token." }],
        };
      }
      await doLogin();
      return {
        content: [
          {
            type: "text",
            text: "Login successful! You can now query workout data.",
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Login failed: ${err.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_sessions_by_date",
  "Get gym sessions for a specific date",
  {
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("Date in YYYY-MM-DD format"),
  },
  async ({ date }) => {
    const token = await getValidToken();
    if (!token) {
      return {
        content: [
          { type: "text", text: "Not logged in. Please run olympus_login first." },
        ],
      };
    }
    const result = await apiCall(
      `/api/mcp/sessions?date=${encodeURIComponent(date)}`,
      token
    );
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_recent_sessions",
  "Get the most recent gym sessions",
  {
    limit: z
      .number()
      .min(1)
      .max(20)
      .default(5)
      .describe("Number of sessions to return (1–20, default 5)"),
  },
  async ({ limit }) => {
    const token = await getValidToken();
    if (!token) {
      return {
        content: [
          { type: "text", text: "Not logged in. Please run olympus_login first." },
        ],
      };
    }
    const result = await apiCall(
      `/api/mcp/sessions/recent?limit=${limit}`,
      token
    );
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_exercise_history",
  "Get weight/rep history for a specific exercise across sessions",
  {
    name: z
      .string()
      .max(200)
      .describe("Exercise name, e.g. 'Barbell Bench Press'"),
    limit: z
      .number()
      .min(1)
      .max(50)
      .default(10)
      .describe("Number of entries to return (1–50, default 10)"),
  },
  async ({ name, limit }) => {
    const token = await getValidToken();
    if (!token) {
      return {
        content: [
          { type: "text", text: "Not logged in. Please run olympus_login first." },
        ],
      };
    }
    const result = await apiCall(
      `/api/mcp/exercises/history?name=${encodeURIComponent(name)}&limit=${limit}`,
      token
    );
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const transport = new StdioServerTransport();
await server.connect(transport);
