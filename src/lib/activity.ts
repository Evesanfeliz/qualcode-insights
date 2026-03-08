import { supabase } from "@/integrations/supabase/client";

export async function logActivity(
  projectId: string,
  userId: string,
  actionType: string,
  description: string,
  metadata?: Record<string, unknown>
) {
  await supabase.from("activity_log").insert([{
    project_id: projectId,
    user_id: userId,
    action_type: actionType,
    description,
    metadata: metadata ?? null,
  }]);
}
