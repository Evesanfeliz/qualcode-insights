import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useProjectRealtime } from "@/hooks/useProjectRealtime";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { logActivity } from "@/lib/activity";
import { ActivityFeed } from "@/components/ActivityFeed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ArrowLeft, Plus, Hash, Activity, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

type CodeWithDetails = {
  id: string;
  label: string;
  color: string | null;
  cycle: string | null;
  definition: string | null;
  inclusion_criteria: string | null;
  exclusion_criteria: string | null;
  example_quote: string | null;
  created_by: string | null;
  project_id: string;
};

const Codebook = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { userId, loading: authLoading } = useCurrentUser();

  const [codes, setCodes] = useState<CodeWithDetails[]>([]);
  const [appCounts, setAppCounts] = useState<Record<string, number>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editState, setEditState] = useState<Partial<CodeWithDetails>>({});
  const [newCodeLabel, setNewCodeLabel] = useState("");
  const [showNewCode, setShowNewCode] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Track who else is editing (via presence)
  const [partnerEditing, setPartnerEditing] = useState<string | null>(null);

  const loadCodes = useCallback(async () => {
    if (!projectId) return;
    const [codesRes, appsRes] = await Promise.all([
      supabase.from("codes").select("id, label, color, cycle, definition, inclusion_criteria, exclusion_criteria, example_quote, created_by, project_id").eq("project_id", projectId).order("label"),
      supabase.from("code_applications").select("code_id").then(({ data }) => {
        const counts: Record<string, number> = {};
        (data ?? []).forEach((a: any) => { counts[a.code_id] = (counts[a.code_id] || 0) + 1; });
        return counts;
      }),
    ]);
    if (codesRes.data) setCodes(codesRes.data as CodeWithDetails[]);
    setAppCounts(appsRes);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadCodes(); }, [loadCodes]);
  useProjectRealtime("codes", projectId, loadCodes);

  // Presence channel for partner editing warning
  useEffect(() => {
    if (!projectId || !userId) return;
    const channel = supabase.channel(`codebook-presence-${projectId}`, {
      config: { presence: { key: userId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const others = Object.entries(state)
          .filter(([key]) => key !== userId)
          .flatMap(([, vals]) => vals as any[]);
        const editing = others.find((o) => o.editing);
        setPartnerEditing(editing?.editing || null);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ editing: null });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [projectId, userId]);

  // Broadcast which code we're editing
  useEffect(() => {
    if (!projectId || !userId) return;
    const channel = supabase.channel(`codebook-presence-${projectId}`);
    channel.track({ editing: expandedId });
  }, [expandedId, projectId, userId]);

  const expandCode = (code: CodeWithDetails) => {
    if (expandedId === code.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(code.id);
    setEditState({
      definition: code.definition ?? "",
      inclusion_criteria: code.inclusion_criteria ?? "",
      exclusion_criteria: code.exclusion_criteria ?? "",
      example_quote: code.example_quote ?? "",
    });
  };

  const saveCodeDetails = async (codeId: string) => {
    const { error } = await supabase.from("codes").update({
      definition: editState.definition,
      inclusion_criteria: editState.inclusion_criteria,
      exclusion_criteria: editState.exclusion_criteria,
      example_quote: editState.example_quote,
    }).eq("id", codeId);

    if (error) { toast.error("Failed to save"); return; }
    toast.success("Codebook entry saved");
    await logActivity(projectId!, userId, "codebook_updated", `Updated codebook entry`);
    loadCodes();
  };

  const createCode = async () => {
    if (!newCodeLabel.trim() || !projectId) return;
    const { error } = await supabase.from("codes").insert({
      project_id: projectId,
      label: newCodeLabel.trim(),
      created_by: userId,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Code created");
    await logActivity(projectId, userId, "code_created", `Created code "${newCodeLabel.trim()}"`);
    setNewCodeLabel("");
    setShowNewCode(false);
    loadCodes();
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary">
        <p className="text-muted-foreground">Loading codebook…</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}/transcripts`)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="font-heading text-base font-bold text-primary">Shared Codebook</h1>
              <p className="text-xs text-muted-foreground">{codes.length} codes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setFeedOpen(!feedOpen)}>
              <Activity className="mr-1.5 h-3.5 w-3.5" />
              Activity
            </Button>
            <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => setShowNewCode(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Code
            </Button>
          </div>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-3xl space-y-3 p-6">
          {showNewCode && (
            <Card className="border-accent/30 bg-accent/5">
              <CardContent className="p-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="New code label…"
                    value={newCodeLabel}
                    onChange={(e) => setNewCodeLabel(e.target.value)}
                    className="flex-1"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && createCode()}
                  />
                  <Button size="sm" onClick={createCode} className="bg-accent text-accent-foreground">Create</Button>
                  <Button size="sm" variant="outline" onClick={() => setShowNewCode(false)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {codes.map((code) => {
            const isExpanded = expandedId === code.id;
            const partnerIsHere = partnerEditing === code.id;

            return (
              <Card key={code.id} className={isExpanded ? "border-accent/40" : ""}>
                <CardHeader className="cursor-pointer p-4" onClick={() => expandCode(code)}>
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <div
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: code.color || "hsl(var(--accent))" }}
                    />
                    <span className="flex-1 font-medium text-foreground">{code.label}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {code.cycle === "second" ? "Second" : "First"}
                    </Badge>
                    <Badge variant="outline" className="tabular-nums text-[10px]">
                      {appCounts[code.id] || 0}×
                    </Badge>
                    {code.created_by && (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-[10px] font-semibold text-accent">
                        {code.created_by === userId ? "A" : "B"}
                      </div>
                    )}
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="space-y-4 px-4 pb-4 pt-0">
                    {partnerIsHere && (
                      <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Your partner is editing this entry
                      </div>
                    )}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Definition</label>
                      <Textarea
                        value={editState.definition ?? ""}
                        onChange={(e) => setEditState((s) => ({ ...s, definition: e.target.value }))}
                        rows={2}
                        className="text-sm"
                        placeholder="What does this code mean?"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Inclusion criteria</label>
                        <Textarea
                          value={editState.inclusion_criteria ?? ""}
                          onChange={(e) => setEditState((s) => ({ ...s, inclusion_criteria: e.target.value }))}
                          rows={2}
                          className="text-sm"
                          placeholder="When to apply…"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">Exclusion criteria</label>
                        <Textarea
                          value={editState.exclusion_criteria ?? ""}
                          onChange={(e) => setEditState((s) => ({ ...s, exclusion_criteria: e.target.value }))}
                          rows={2}
                          className="text-sm"
                          placeholder="When NOT to apply…"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Example quote</label>
                      <Textarea
                        value={editState.example_quote ?? ""}
                        onChange={(e) => setEditState((s) => ({ ...s, example_quote: e.target.value }))}
                        rows={2}
                        className="text-sm"
                        placeholder="Verbatim excerpt..."
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        className="bg-accent text-accent-foreground hover:bg-accent/90"
                        onClick={() => saveCodeDetails(code.id)}
                      >
                        Save
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}

          {codes.length === 0 && !showNewCode && (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No codes yet. Create your first code to start building the codebook.
            </p>
          )}
        </div>
      </ScrollArea>

      <ActivityFeed projectId={projectId!} open={feedOpen} onClose={() => setFeedOpen(false)} />
    </div>
  );
};

export default Codebook;
