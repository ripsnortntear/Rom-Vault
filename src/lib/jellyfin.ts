/**
 * Jellyfin API Integration & Single Sign-On Account Provisioning
 * Synchronizes user accounts, roles, and passwords between OldsmarChaos SSO and Jellyfin
 * so users can authenticate on native Smart TV clients, Roku, Apple TV, and mobile apps.
 */

const JELLYFIN_URL = process.env.JELLYFIN_INTERNAL_URL || "http://127.0.0.1:8096";
const JELLYFIN_API_KEY = process.env.JELLYFIN_API_KEY || "";

interface JellyfinUser {
  Id: string;
  Name: string;
  HasPassword: boolean;
  Policy: {
    IsAdministrator: boolean;
    IsHidden?: boolean;
    EnableAllFolders?: boolean;
    EnableMediaPlayback?: boolean;
    [key: string]: any;
  };
  [key: string]: any;
}

/**
 * Returns authorization headers for Jellyfin API requests.
 */
function getHeaders(): Record<string, string> {
  return {
    Authorization: `MediaBrowser Token="${JELLYFIN_API_KEY}"`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/**
 * Fetch all users from Jellyfin.
 */
export async function getJellyfinUsers(): Promise<JellyfinUser[]> {
  if (!JELLYFIN_API_KEY) {
    console.warn("[Jellyfin] JELLYFIN_API_KEY is not configured.");
    return [];
  }

  const res = await fetch(`${JELLYFIN_URL}/Users`, {
    method: "GET",
    headers: getHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Failed to fetch Jellyfin users: ${res.status} ${errorText}`);
  }

  return (await res.json()) as JellyfinUser[];
}

/**
 * Provision or synchronize an SSO user account to Jellyfin.
 * Updates password and admin role if specified.
 */
export async function syncJellyfinUser(
  username: string,
  password?: string,
  role?: string
): Promise<{ success: boolean; userId?: string; error?: string }> {
  try {
    if (!JELLYFIN_API_KEY) {
      console.warn("[Jellyfin Sync] Skipped: JELLYFIN_API_KEY is not configured.");
      return { success: false, error: "Jellyfin API key not configured" };
    }

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      return { success: false, error: "Username is empty" };
    }

    // 1. Check if user already exists
    const users = await getJellyfinUsers();
    let targetUser = users.find(
      (u) => u.Name.toLowerCase() === cleanUsername.toLowerCase()
    );

    let userId: string;

    // 2. Create user if not present
    if (!targetUser) {
      console.log(`[Jellyfin Sync] User "${cleanUsername}" not found in Jellyfin. Creating new user...`);
      const createRes = await fetch(`${JELLYFIN_URL}/Users/New`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ Name: cleanUsername }),
      });

      if (!createRes.ok) {
        const errorText = await createRes.text().catch(() => "");
        throw new Error(`Failed to create Jellyfin user: ${createRes.status} ${errorText}`);
      }

      targetUser = (await createRes.json()) as JellyfinUser;
      userId = targetUser.Id;
      console.log(`[Jellyfin Sync] Created user "${cleanUsername}" (ID: ${userId}).`);
    } else {
      userId = targetUser.Id;
    }

    // 3. Update Password if provided
    if (password) {
      const pwRes = await fetch(`${JELLYFIN_URL}/Users/${userId}/Password`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          Id: userId,
          NewPw: password,
          ResetPassword: false,
        }),
      });

      if (!pwRes.ok) {
        const errorText = await pwRes.text().catch(() => "");
        throw new Error(`Failed to set password for Jellyfin user "${cleanUsername}": ${pwRes.status} ${errorText}`);
      }
      console.log(`[Jellyfin Sync] Successfully updated password for "${cleanUsername}".`);
    }

    // 4. Update Admin Policy if role is specified
    if (role && targetUser.Policy) {
      const shouldBeAdmin = role === "admin";
      if (targetUser.Policy.IsAdministrator !== shouldBeAdmin) {
        console.log(`[Jellyfin Sync] Updating role policy for "${cleanUsername}" (Admin: ${shouldBeAdmin})...`);
        const updatedPolicy = {
          ...targetUser.Policy,
          IsAdministrator: shouldBeAdmin,
          EnableLiveTvManagement: shouldBeAdmin,
          EnableCollectionManagement: shouldBeAdmin,
          EnableSubtitleManagement: shouldBeAdmin,
          EnableLyricManagement: shouldBeAdmin,
          EnableRemoteControlOfOtherUsers: shouldBeAdmin,
          EnableContentDeletion: shouldBeAdmin,
        };

        const polRes = await fetch(`${JELLYFIN_URL}/Users/${userId}/Policy`, {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify(updatedPolicy),
        });

        if (!polRes.ok) {
          const errorText = await polRes.text().catch(() => "");
          console.warn(`[Jellyfin Sync] Policy update warning for "${cleanUsername}": ${polRes.status} ${errorText}`);
        }
      }
    }

    return { success: true, userId };
  } catch (err: any) {
    console.error(`[Jellyfin Sync Error for "${username}"]:`, err.message || err);
    return { success: false, error: err.message || String(err) };
  }
}
