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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Activity, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading codebook…</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}/transcripts`)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="font-heading text-base text-foreground">Shared Codebook</h1>
              <p className="font-mono text-[10px] text-muted-foreground">{codes.length} codes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setFeedOpen(!feedOpen)}>
              <Activity className="mr-1.5 h-3.5 w-3.5" />
              Activity
            </Button>
            <Button size="sm" onClick={() => setShowNewCode(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Code
            </Button>
          </div>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-[1000px] p-6">
          {showNewCode && (
            <div className="mb-4 flex gap-2 rounded-lg border border-primary/30 bg-card p-4">
              <Input
                placeholder="New code label…"
                value={newCodeLabel}
                onChange={(e) => setNewCodeLabel(e.target.value)}
                className="flex-1"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && createCode()}
              />
              <Button size="sm" onClick={createCode}>Create</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowNewCode(false)}>Cancel</Button>
            </div>
          )}

          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8"></TableHead>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead className="w-28">Cycle</TableHead>
                  <TableHead className="w-20 text-right">Freq.</TableHead>
                  <TableHead className="w-16 text-center">By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-16 text-center text-sm text-muted-foreground">
                      No codes yet. Create your first code to start building the codebook.
                    </TableCell>
                  </TableRow>
                ) : codes.map((code) => {
                  const isExpanded = expandedId === code.id;
                  const partnerIsHere = partnerEditing === code.id;

                  return (
                    <>
                      <TableRow
                        key={code.id}
                        className="cursor-pointer"
                        onClick={() => expandCode(code)}
                      >
                        <TableCell className="px-2">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="px-2">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: code.color || "hsl(var(--primary))" }}
                          />
                        </TableCell>
                        <TableCell className="font-medium text-foreground">{code.label}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {code.cycle === "second" ? "SECOND-CYCLE" : "FIRST-CYCLE"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                          {appCounts[code.id] || 0}
                        </TableCell>
                        <TableCell className="text-center">
                          {code.created_by && (
                            <span className="font-mono text-[10px] text-primary">
                              {code.created_by === userId ? "A" : "B"}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>

                      {isExpanded && (
                        <TableRow key={`${code.id}-expanded`} className="hover:bg-transparent">
                          <TableCell colSpan={6} className="bg-secondary/30 px-8 py-4">
                            {partnerIsHere && (
                              <div className="mb-3 flex items-center gap-2 rounded-sm border border-destructive/30 px-3 py-2 text-xs text-destructive">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Your partner is editing this entry
                              </div>
                            )}
                            <div className="space-y-4">
                              <div>
                                <label className="mb-1 block font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Definition</label>
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
                                  <label className="mb-1 block font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Inclusion criteria</label>
                                  <Textarea
                                    value={editState.inclusion_criteria ?? ""}
                                    onChange={(e) => setEditState((s) => ({ ...s, inclusion_criteria: e.target.value }))}
                                    rows={2}
                                    className="text-sm"
                                    placeholder="When to apply…"
                                  />
                                </div>
                                <div>
                                  <label className="mb-1 block font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Exclusion criteria</label>
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
                                <label className="mb-1 block font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Example quote</label>
                                <Textarea
                                  value={editState.example_quote ?? ""}
                                  onChange={(e) => setEditState((s) => ({ ...s, example_quote: e.target.value }))}
                                  rows={2}
                                  className="text-sm font-mono italic"
                                  placeholder="Verbatim excerpt..."
                                />
                              </div>
                              <div className="flex justify-end">
                                <Button size="sm" onClick={() => saveCodeDetails(code.id)}>
                                  Save
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </ScrollArea>

      <ActivityFeed projectId={projectId!} open={feedOpen} onClose={() => setFeedOpen(false)} />
    </div>
  );
};

export default Codebook;
