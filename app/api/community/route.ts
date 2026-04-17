import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-admin";
import { defaultProgressStateForUser, normalizeProgressState, type ProgressState } from "@/lib/progress";

type UserRow = {
  id: string;
  username: string;
  created_at: string | null;
};

type ProgressRow = {
  id: string;
  state: ProgressState | null;
  updated_at: string | null;
};

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      authenticated: false,
      people: [],
      message: "Database is not configured. Other people are only available when accounts are enabled.",
    });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({
      configured: true,
      authenticated: false,
      people: [],
      message: "Sign in to see other people using the app.",
    }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const { data: userRows, error: usersError } = await supabase
    .from("pokemon_app_users")
    .select("id, username, created_at")
    .neq("id", user.id)
    .order("username", { ascending: true });

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 });
  }

  const people = (userRows ?? []) as UserRow[];
  const ids = people.map((person) => person.id);
  const progressByUser = new Map<string, ProgressRow>();

  if (ids.length) {
    const { data: progressRows, error: progressError } = await supabase
      .from("pokemon_progress")
      .select("id, state, updated_at")
      .in("id", ids);

    if (progressError) {
      return NextResponse.json({ error: progressError.message }, { status: 500 });
    }

    for (const row of (progressRows ?? []) as ProgressRow[]) {
      progressByUser.set(row.id, row);
    }
  }

  return NextResponse.json({
    configured: true,
    authenticated: true,
    user,
    people: people.map((person) => {
      const progress = progressByUser.get(person.id);
      return {
        id: person.id,
        username: person.username,
        createdAt: person.created_at,
        updatedAt: progress?.updated_at ?? null,
        progress: normalizeProgressState(progress?.state ?? defaultProgressStateForUser(person.username)),
      };
    }),
  });
}
