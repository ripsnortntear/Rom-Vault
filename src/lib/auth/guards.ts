import "server-only";

import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import type { AuthSession } from "@/types/auth";

/**
 * Ensures the request is from an authenticated user.
 * Redirects to the login route if not authenticated.
 */
export async function requireUser(): Promise<AuthSession["user"]> {
  const session = await getCurrentSession();
  if (!session || !session.user) {
    redirect("/auth/login");
  }
  return session.user;
}

/**
 * Ensures the request is from an authenticated administrator.
 * Throws an unauthorized/forbidden Error if the user is not an admin.
 */
export async function requireAdmin(): Promise<AuthSession["user"]> {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new Error("Forbidden: Administrator privileges required.");
  }
  return user;
}

/**
 * Retrieves the current authenticated user if one exists, otherwise returns null.
 */
export async function getOptionalUser(): Promise<AuthSession["user"] | null> {
  const session = await getCurrentSession();
  return session?.user ?? null;
}
