import { NextResponse } from "next/server";
import {
  clearUserSession,
  createAppUser,
  createUserSession,
  getCurrentUser,
  normalizePassword,
  normalizeUsername,
  validateCredentials,
  verifyAppUser,
} from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase-admin";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      authenticated: false,
      user: null,
    });
  }

  const user = await getCurrentUser();
  return NextResponse.json({
    configured: true,
    authenticated: Boolean(user),
    user,
  });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const payload = await request.json().catch(() => ({}));
  const mode = payload.mode === "signup" ? "signup" : "login";
  const username = normalizeUsername(payload.username);
  const password = normalizePassword(payload.password);
  const credentialError = validateCredentials(username, password);

  if (credentialError) {
    return NextResponse.json({ error: credentialError }, { status: 400 });
  }

  try {
    const user = mode === "signup"
      ? await createAppUser(username, password)
      : await verifyAppUser(username, password);

    if (!user) {
      return NextResponse.json({ error: "Username or password is incorrect." }, { status: 401 });
    }

    await createUserSession(user);
    return NextResponse.json({
      configured: true,
      authenticated: true,
      user,
      message: mode === "signup" ? "Account created." : "Signed in.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not sign in.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE() {
  await clearUserSession();
  return NextResponse.json({
    authenticated: false,
    user: null,
    message: "Signed out.",
  });
}
