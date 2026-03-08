import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type OnboardingProgress = {
  id: string;
  user_id: string;
  welcome_completed: boolean;
  practice_completed: boolean;
  tour_completed: boolean;
  tour_step_reached: number;
  completed_at: string | null;
  created_at: string;
};

export function useOnboarding() {
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const { data } = await supabase
        .from("onboarding_progress" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      setProgress(data as unknown as OnboardingProgress | null);
      setLoading(false);
    };
    load();
  }, []);

  const initProgress = useCallback(async () => {
    if (!userId) return null;
    const { data, error } = await supabase
      .from("onboarding_progress" as any)
      .insert({ user_id: userId } as any)
      .select()
      .single();
    if (error && error.code === "23505") {
      const { data: existing } = await supabase
        .from("onboarding_progress" as any)
        .select("*")
        .eq("user_id", userId)
        .single();
      const result = existing as unknown as OnboardingProgress;
      setProgress(result);
      return result;
    }
    const result = data as unknown as OnboardingProgress;
    setProgress(result);
    return result;
  }, [userId]);

  const updateProgress = useCallback(async (updates: Partial<OnboardingProgress>) => {
    if (!userId) return;
    const { data } = await supabase
      .from("onboarding_progress" as any)
      .update(updates as any)
      .eq("user_id", userId)
      .select()
      .single();
    if (data) setProgress(data as unknown as OnboardingProgress);
  }, [userId]);

  const isComplete = progress?.welcome_completed && progress?.practice_completed && progress?.tour_completed;

  return { progress, loading, userId, initProgress, updateProgress, isComplete };
}
