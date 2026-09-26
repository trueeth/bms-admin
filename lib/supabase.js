import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
}

export const templateBucket = process.env.NEXT_PUBLIC_SUPABASE_TEMPLATE_BUCKET || "resume-templates";
export const resumeBucket = process.env.NEXT_PUBLIC_SUPABASE_RESUME_BUCKET || "generated-resumes";

export const supabase = createClient(supabaseUrl || "https://example.supabase.co", supabaseAnonKey || "missing-key", {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
