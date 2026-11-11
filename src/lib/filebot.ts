import { execFile } from "node:child_process";
import https from "node:https";
import querystring from "node:querystring";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const FILEBOT_HTPASSWD_PATH =
  process.env.FILEBOT_HTPASSWD_PATH || "/home/cfw34683/docker/filebot/config/webauth-htpasswd";
export const FILEBOT_CONTAINER_NAME = process.env.FILEBOT_CONTAINER_NAME || "filebot";
export const FILEBOT_ADMIN_USER = process.env.FILEBOT_ADMIN_USER || "cfw34683";
export const FILEBOT_ADMIN_PASSWORD =
  process.env.FILEBOT_ADMIN_PASSWORD || process.env.DB_PASSWORD || "G234ihb72916!?";

/**
 * Provision or update user credentials in FileBot's webauth database.
 */
export async function syncFilebotUser(
  username: string,
  password?: string
): Promise<{ success: boolean; error?: string }> {
  const cleanUsername = username.trim();
  if (!cleanUsername) {
    return { success: false, error: "Username is empty" };
  }

  if (!password) {
    return { success: true };
  }

  try {
    // Use Apache MD5 / APR1 format (-m) as required by jlesage/baseimage-gui webauth daemon
    await execFileAsync("/usr/bin/htpasswd", ["-m", "-b", FILEBOT_HTPASSWD_PATH, cleanUsername, password]);

    // Signal webauth daemon inside filebot container to reload password database
    execFileAsync("docker", ["exec", FILEBOT_CONTAINER_NAME, "pkill", "-x", "webauth"]).catch(() => {});

    return { success: true };
  } catch (err: any) {
    console.error(`[FileBot Sync] Failed provisioning user "${cleanUsername}":`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Retrieve a valid FileBot web authentication cookie token for an administrator.
 */
export async function getFilebotAuthCookie(
  username = FILEBOT_ADMIN_USER,
  password = FILEBOT_ADMIN_PASSWORD
): Promise<string | null> {
  return new Promise((resolve) => {
    const postData = querystring.stringify({
      username,
      password,
    });

    const req = https.request(
      {
        hostname: "127.0.0.1",
        port: 5800,
        path: "/login/login",
        method: "POST",
        rejectUnauthorized: false,
        timeout: 5000,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(postData),
          Cookie: "login_success_url=/;login_failure_url=/login/;",
        },
      },
      (res) => {
        res.resume();
        const setCookie = res.headers["set-cookie"];
        if (setCookie && Array.isArray(setCookie)) {
          const authItem = setCookie.find((c) => c.trim().startsWith("auth="));
          if (authItem) {
            const token = authItem.split(";")[0].replace(/^auth=/, "").trim();
            return resolve(token);
          }
        }
        resolve(null);
      }
    );

    req.on("error", (err) => {
      console.error("[FileBot AutoLogin] Error connecting to FileBot login:", err);
      resolve(null);
    });

    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
}
