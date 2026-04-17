import { NextResponse } from "next/server";
import { createSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-admin";
import { defaultProgressState, normalizeProgressState, type ProgressState } from "@/lib/progress";

const PROGRESS_ID = "shared";

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

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("pokemon_progress")
    .select("state, updated_at")
    .eq("id", PROGRESS_ID)
    .maybeSingle<ProgressRow>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    configured: true,
    progress: normalizeProgressState(data?.state ?? defaultProgressState),
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

  const progress = normalizeProgressState(await request.json());
  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from("pokemon_progress")
    .upsert({
      id: PROGRESS_ID,
      state: progress,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    configured: true,
    progress,
    message: "Progress saved.",
  });
}
