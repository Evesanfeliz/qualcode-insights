import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to realtime changes on a table filtered by project_id.
 * Calls `onUpdate` whenever an INSERT, UPDATE, or DELETE occurs.
 */
export function useProjectRealtime(
  table: string,
  projectId: string | undefined,
  onUpdate: () => void
) {
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`${table}-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `project_id=eq.${projectId}`,
        },
        () => onUpdate()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, projectId, onUpdate]);
}

/**
 * Subscribe to realtime on a table filtered by a custom column (e.g. memo_id).
 */
export function useTableRealtime(
  table: string,
  filterColumn: string,
  filterValue: string | undefined,
  onUpdate: () => void
) {
  useEffect(() => {
    if (!filterValue) return;

    const channel = supabase
      .channel(`${table}-${filterColumn}-${filterValue}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `${filterColumn}=eq.${filterValue}`,
        },
        () => onUpdate()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filterColumn, filterValue, onUpdate]);
}
