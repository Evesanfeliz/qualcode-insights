import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProjectRealtime } from "@/hooks/useProjectRealtime";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Activity, X, Code2, FileText, BookOpen, UserPlus, Edit } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type ActivityItem = {
  id: string;
  user_id: string;
  action_type: string;
  description: string;
  created_at: string;
};

const ACTION_ICONS: Record<string, React.ElementType> = {
  code_created: Code2,
  code_applied: Code2,
  memo_written: FileText,
  codebook_updated: BookOpen,
  collaborator_joined: UserPlus,
};

export function ActivityFeed({
  projectId,
  open,
  onClose,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [items, setItems] = useState<ActivityItem[]>([]);

  const load = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from("activity_log")
      .select("id, user_id, action_type, description, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setItems(data as ActivityItem[]);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  useProjectRealtime("activity_log", projectId, load);

  if (!open) return null;

  return (
    <div className="fixed right-0 top-0 z-40 flex h-full w-80 flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="font-heading text-sm text-foreground">Activity</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-0.5 p-3">
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No activity yet</p>
          ) : (
            items.map((item) => {
              const Icon = ACTION_ICONS[item.action_type] || Edit;
              return (
                <div
                  key={item.id}
                  className="flex gap-3 rounded-sm px-3 py-2 transition-colors hover:bg-secondary"
                >
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/20">
                    <Icon className="h-3 w-3 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-foreground leading-relaxed">{item.description}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
