import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { createSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-admin";

const SESSION_COOKIE = "pokemon_session";
const SESSION_DAYS = 30;
const HASH_ITERATIONS = 310000;
const KEY_LENGTH = 32;

export type AuthUser = {
  id: string;
  username: string;
};

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  salt: string;
};

type SessionRow = {
  user_id: string;
  expires_at: string;
  pokemon_app_users: {
    id: string;
    username: string;
  } | null;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hashPassword(password: string, salt: string) {
  return pbkdf2Sync(password, salt, HASH_ITERATIONS, KEY_LENGTH, "sha256").toString("hex");
}

function verifyPassword(password: string, salt: string, expectedHash: string) {
  const actualHash = hashPassword(password, salt);
  const actual = Buffer.from(actualHash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function normalizeUsername(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function normalizePassword(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function validateCredentials(username: string, password: string) {
  if (username.length < 2 || username.length > 32) {
    return "Use a username between 2 and 32 characters.";
  }
  if (!/^[a-zA-Z0-9 _.-]+$/.test(username)) {
    return "Use only letters, numbers, spaces, dots, dashes, or underscores.";
  }
  if (password.length < 8) {
    return "Use a password with at least 8 characters.";
  }
  return null;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!isSupabaseConfigured()) return null;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("pokemon_app_sessions")
    .select("user_id, expires_at, pokemon_app_users(id, username)")
    .eq("token_hash", hashToken(token))
    .maybeSingle<SessionRow>();

  if (error || !data || !data.pokemon_app_users) return null;

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    await supabase.from("pokemon_app_sessions").delete().eq("token_hash", hashToken(token));
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }

  return {
    id: data.pokemon_app_users.id,
    username: data.pokemon_app_users.username,
  };
}

export async function createUserSession(user: AuthUser) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const supabase = createSupabaseAdmin();
  const { error } = await supabase.from("pokemon_app_sessions").insert({
    user_id: user.id,
    token_hash: hashToken(token),
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearUserSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token && isSupabaseConfigured()) {
    const supabase = createSupabaseAdmin();
    await supabase.from("pokemon_app_sessions").delete().eq("token_hash", hashToken(token));
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function createAppUser(username: string, password: string): Promise<AuthUser> {
  const supabase = createSupabaseAdmin();
  const salt = randomBytes(16).toString("hex");
  const passwordHash = hashPassword(password, salt);
  const { data, error } = await supabase
    .from("pokemon_app_users")
    .insert({
      username,
      username_key: username.toLowerCase(),
      password_hash: passwordHash,
      salt,
    })
    .select("id, username")
    .single<AuthUser>();

  if (error) {
    if (error.code === "23505") {
      throw new Error("That username is already taken.");
    }
    throw new Error(error.message);
  }

  return data;
}

export async function verifyAppUser(username: string, password: string): Promise<AuthUser | null> {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("pokemon_app_users")
    .select("id, username, password_hash, salt")
    .eq("username_key", username.toLowerCase())
    .maybeSingle<UserRow>();

  if (error || !data) return null;
  if (!verifyPassword(password, data.salt, data.password_hash)) return null;

  return {
    id: data.id,
    username: data.username,
  };
}
