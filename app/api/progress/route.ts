import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-admin";
import { defaultProgressState, defaultProgressStateForUser, normalizeProgressState, type ProgressState } from "@/lib/progress";

type ProgressRow = {
  state: ProgressState | null;
  updated_at: string | null;
};

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      progress: defaultProgressState,
      message: "Database is not configured. Using local browser storage.",
    });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({
      configured: true,
      authenticated: false,
      progress: null,
      message: "Sign in to save progress to the database.",
    }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("pokemon_progress")
    .select("state, updated_at")
    .eq("id", user.id)
    .maybeSingle<ProgressRow>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    configured: true,
    authenticated: true,
    user,
    progress: normalizeProgressState(data?.state ?? defaultProgressStateForUser(user.username)),
    updatedAt: data?.updated_at ?? null,
  });
}

export async function PUT(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      message: "Database is not configured. Progress was not saved remotely.",
    });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({
      configured: true,
      authenticated: false,
      message: "Sign in to save progress to the database.",
    }, { status: 401 });
  }

  const progress = normalizeProgressState(await request.json());
  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from("pokemon_progress")
    .upsert({
      id: user.id,
      state: progress,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    configured: true,
    authenticated: true,
    user,
    progress,
    message: "Progress saved.",
  });
}
