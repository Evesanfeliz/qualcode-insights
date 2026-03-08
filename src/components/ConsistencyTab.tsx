import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Loader2, ChevronDown, ChevronRight, GitMerge, GitBranch, PenLine } from "lucide-react";
import { toast } from "sonner";

type DriftResult = {
  code_label: string;
  drift_type: string;
  example_a: string;
  example_b: string;
  explanation: string;
  suggestion: string;
  suggested_resolution: string;
};

type ConsistencyTabProps = {
  projectId: string;
  userId: string;
};

export const ConsistencyTab = ({ projectId, userId }: ConsistencyTabProps) => {
  const [results, setResults] = useState<DriftResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [hasRun, setHasRun] = useState(false);

  // Action states
  const [actionIdx, setActionIdx] = useState<number | null>(null);
  const [actionType, setActionType] = useState<string | null>(null);
  const [actionInput, setActionInput] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const runAudit = useCallback(async () => {
    setLoading(true);
    setResults([]);
    try {
      // Fetch project info
      const { data: project } = await supabase
        .from("projects")
        .select("research_question, domain_framework")
        .eq("id", projectId)
        .single();

      // Fetch all codes with their applications
      const { data: codes } = await supabase
        .from("codes")
        .select("id, label")
        .eq("project_id", projectId);

      if (!codes || codes.length === 0) {
        toast.info("No codes to audit");
        setLoading(false);
        setHasRun(true);
        return;
      }

      const { data: apps } = await supabase
        .from("code_applications")
        .select("code_id, segment_text, transcript_id, applied_by");

      const { data: transcripts } = await supabase
        .from("transcripts")
        .select("id, participant_pseudonym")
        .eq("project_id", projectId);

      const transcriptMap = Object.fromEntries(
        (transcripts || []).map((t: any) => [t.id, t.participant_pseudonym])
      );

      // Build grouped text
      const grouped = (codes as any[]).map((code) => {
        const codeApps = (apps || []).filter((a: any) => a.code_id === code.id);
        const segments = codeApps.map((a: any) => ({
          segment_text: a.segment_text,
          transcript: transcriptMap[a.transcript_id] || "Unknown",
          researcher: a.applied_by === userId ? "Researcher A" : "Researcher B",
        }));
        return `CODE: ${code.label}\n${segments.map((s: any) => `  - "${s.segment_text}" (Transcript: ${s.transcript}, By: ${s.researcher})`).join("\n")}`;
      }).join("\n\n");

      const { data, error } = await supabase.functions.invoke("ai-consistency-audit", {
        body: {
          research_question: project?.research_question,
          domain_framework: project?.domain_framework,
          code_applications: grouped,
        },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
      } else {
        setResults(data?.drifting_codes || []);
        // Save to disagreement_threads
        for (const drift of data?.drifting_codes || []) {
          const matchingCode = (codes as any[]).find((c) => c.label === drift.code_label);
          if (matchingCode) {
            await supabase.from("disagreement_threads").insert({
              project_id: projectId,
              code_id: matchingCode.id,
              trigger_type: "ai_drift",
              drift_type: drift.drift_type,
              example_a: drift.example_a,
              example_b: drift.example_b,
              explanation: drift.explanation,
              suggestion: drift.suggestion,
              suggested_resolution: drift.suggested_resolution,
            } as any);
          }
        }
      }
    } catch (err: any) {
      console.error("Audit failed:", err);
      toast.error("Consistency audit failed");
    } finally {
      setLoading(false);
      setHasRun(true);
    }
  }, [projectId, userId]);

  const handleAction = async (idx: number, type: string) => {
    if (actionIdx === idx && actionType === type) {
      setActionIdx(null);
      setActionType(null);
      return;
    }
    setActionIdx(idx);
    setActionType(type);
    setActionInput("");
  };

  const confirmAction = async (drift: DriftResult) => {
    if (!actionInput.trim()) return;
    setActionLoading(true);
    try {
      const { data: codes } = await supabase
        .from("codes")
        .select("id, label")
        .eq("project_id", projectId)
        .eq("label", drift.code_label);

      const code = codes?.[0];
      if (!code) { toast.error("Code not found"); return; }

      if (actionType === "merge") {
        await supabase.from("codes").update({ definition: actionInput }).eq("id", code.id);
        toast.success("Code definition updated (merged)");
      } else if (actionType === "split") {
        await supabase.from("codes").insert({
          project_id: projectId,
          label: actionInput,
          created_by: userId,
        });
        toast.success(`New code "${actionInput}" created`);
      } else if (actionType === "redefine") {
        await supabase.from("codes").update({ definition: actionInput }).eq("id", code.id);
        toast.success("Code redefined");
      }

      setActionIdx(null);
      setActionType(null);
      setActionInput("");
    } catch (err: any) {
      toast.error("Action failed");
    } finally {
      setActionLoading(false);
    }
  };

  const driftBadgeClass: Record<string, string> = {
    cross_researcher: "border-warning/40 text-warning",
    cross_transcript: "border-accent/40 text-accent",
    both: "border-destructive/40 text-destructive",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-lg text-foreground">Consistency Audit</h2>
          <p className="text-xs text-muted-foreground">
            Detect semantic drift across transcripts and researchers
          </p>
        </div>
        <Button onClick={runAudit} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Auditing…
            </>
          ) : (
            <>
              <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
              Run Consistency Audit
            </>
          )}
        </Button>
      </div>

      {hasRun && results.length === 0 && !loading && (
        <div className="rounded-lg border border-success/30 bg-success/5 px-6 py-8 text-center">
          <p className="text-sm text-success">No semantic drift detected. Your coding is consistent.</p>
        </div>
      )}

      {results.length > 0 && (
        <ScrollArea className="max-h-[600px]">
          <div className="space-y-2">
            {results.map((drift, idx) => {
              const isExpanded = expandedIdx === idx;
              return (
                <div key={idx} className="rounded-lg border border-border bg-card overflow-hidden">
                  <button
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    onClick={() => setExpandedIdx(isExpanded ? null : idx)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="font-medium text-sm text-foreground">{drift.code_label}</span>
                    <Badge variant="outline" className={driftBadgeClass[drift.drift_type] || ""}>
                      {drift.drift_type?.replace("_", " ").toUpperCase()}
                    </Badge>
                    <Badge variant="outline" className="ml-auto border-muted-foreground/30 text-muted-foreground">
                      {drift.suggestion?.toUpperCase()}
                    </Badge>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border px-4 py-4 space-y-4">
                      {/* Side by side examples */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-sm border border-border bg-secondary/30 p-3">
                          <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Example A</p>
                          <p className="text-sm italic text-foreground leading-relaxed">"{drift.example_a}"</p>
                        </div>
                        <div className="rounded-sm border border-border bg-secondary/30 p-3">
                          <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Example B</p>
                          <p className="text-sm italic text-foreground leading-relaxed">"{drift.example_b}"</p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm text-foreground">{drift.explanation}</p>
                        <p className="text-sm text-muted-foreground italic">{drift.suggested_resolution}</p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={actionIdx === idx && actionType === "merge" ? "default" : "outline"}
                          onClick={() => handleAction(idx, "merge")}
                        >
                          <GitMerge className="mr-1.5 h-3 w-3" />
                          Merge codes
                        </Button>
                        <Button
                          size="sm"
                          variant={actionIdx === idx && actionType === "split" ? "default" : "outline"}
                          onClick={() => handleAction(idx, "split")}
                        >
                          <GitBranch className="mr-1.5 h-3 w-3" />
                          Split into two
                        </Button>
                        <Button
                          size="sm"
                          variant={actionIdx === idx && actionType === "redefine" ? "default" : "outline"}
                          onClick={() => handleAction(idx, "redefine")}
                        >
                          <PenLine className="mr-1.5 h-3 w-3" />
                          Update definition
                        </Button>
                      </div>

                      {/* Inline action form */}
                      {actionIdx === idx && actionType && (
                        <div className="rounded-sm border border-primary/30 bg-secondary/50 p-3 space-y-2">
                          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            {actionType === "merge" && "New merged definition"}
                            {actionType === "split" && "Label for the new split code"}
                            {actionType === "redefine" && "Updated definition"}
                          </p>
                          {actionType === "split" ? (
                            <Input
                              value={actionInput}
                              onChange={(e) => setActionInput(e.target.value)}
                              placeholder="New code label…"
                            />
                          ) : (
                            <Textarea
                              value={actionInput}
                              onChange={(e) => setActionInput(e.target.value)}
                              rows={2}
                              placeholder="Enter definition…"
                            />
                          )}
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => confirmAction(drift)} disabled={actionLoading}>
                              {actionLoading ? "Saving…" : "Confirm"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setActionIdx(null); setActionType(null); }}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};
