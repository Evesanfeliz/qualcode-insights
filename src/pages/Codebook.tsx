import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useProjectRealtime } from "@/hooks/useProjectRealtime";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { logActivity } from "@/lib/activity";
import { ActivityFeed } from "@/components/ActivityFeed";
import { ConsistencyTab } from "@/components/ConsistencyTab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Activity, AlertTriangle, ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type Theory = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: string;
};

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
  origin: string | null;
  theory_id: string | null;
};

const ORIGIN_OPTIONS = [
  { value: "researcher", label: "Researcher" },
  { value: "in_vivo", label: "In Vivo" },
  { value: "a_priori", label: "A Priori" },
  { value: "ai_suggested", label: "AI Suggested" },
];

const Codebook = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { userId, loading: authLoading } = useCurrentUser();

  const [codes, setCodes] = useState<CodeWithDetails[]>([]);
  const [theories, setTheories] = useState<Theory[]>([]);
  const [appCounts, setAppCounts] = useState<Record<string, number>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editState, setEditState] = useState<Partial<CodeWithDetails>>({});
  const [showNewCode, setShowNewCode] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [partnerEditing, setPartnerEditing] = useState<string | null>(null);

  // New code creation state — all fields inline
  const [newCodeLabel, setNewCodeLabel] = useState("");
  const [newCodeTheoryId, setNewCodeTheoryId] = useState("");
  const [newCodeOrigin, setNewCodeOrigin] = useState("researcher");
  const [newCodeDefinition, setNewCodeDefinition] = useState("");
  const [newCodeInclusion, setNewCodeInclusion] = useState("");
  const [newCodeExclusion, setNewCodeExclusion] = useState("");
  const [newCodeExample, setNewCodeExample] = useState("");

  const loadCodes = useCallback(async () => {
    if (!projectId) return;
    const [codesRes, appsRes, theoriesRes] = await Promise.all([
      supabase.from("codes").select("id, label, color, cycle, definition, inclusion_criteria, exclusion_criteria, example_quote, created_by, project_id, origin, theory_id").eq("project_id", projectId).order("label"),
      supabase.from("code_applications").select("code_id").then(({ data }) => {
        const counts: Record<string, number> = {};
        (data ?? []).forEach((a: any) => { counts[a.code_id] = (counts[a.code_id] || 0) + 1; });
        return counts;
      }),
      supabase.from("theories").select("*").eq("project_id", projectId).order("name"),
    ]);
    if (codesRes.data) setCodes(codesRes.data as CodeWithDetails[]);
    setAppCounts(appsRes);
    if (theoriesRes.data) setTheories(theoriesRes.data as Theory[]);
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
        if (status === "SUBSCRIBED") await channel.track({ editing: null });
      });
    return () => { supabase.removeChannel(channel); };
  }, [projectId, userId]);

  useEffect(() => {
    if (!projectId || !userId) return;
    const channel = supabase.channel(`codebook-presence-${projectId}`);
    channel.track({ editing: expandedId });
  }, [expandedId, projectId, userId]);

  const expandCode = (code: CodeWithDetails) => {
    if (expandedId === code.id) { setExpandedId(null); return; }
    setExpandedId(code.id);
    setEditState({
      definition: code.definition ?? "",
      inclusion_criteria: code.inclusion_criteria ?? "",
      exclusion_criteria: code.exclusion_criteria ?? "",
      example_quote: code.example_quote ?? "",
      origin: code.origin ?? "researcher",
      theory_id: code.theory_id ?? "",
    });
  };

  const saveCodeDetails = async (codeId: string) => {
    const theory = theories.find(t => t.id === editState.theory_id);
    const { error } = await supabase.from("codes").update({
      definition: editState.definition,
      inclusion_criteria: editState.inclusion_criteria,
      exclusion_criteria: editState.exclusion_criteria,
      example_quote: editState.example_quote,
      origin: editState.origin || "researcher",
      theory_id: editState.theory_id || null,
      color: theory ? theory.color : null,
    }).eq("id", codeId);
    if (error) { toast.error("Failed to save"); return; }
    toast.success("Codebook entry saved");
    await logActivity(projectId!, userId, "codebook_updated", `Updated codebook entry`);
    loadCodes();
  };

  const resetNewCodeForm = () => {
    setNewCodeLabel("");
    setNewCodeTheoryId("");
    setNewCodeOrigin("researcher");
    setNewCodeDefinition("");
    setNewCodeInclusion("");
    setNewCodeExclusion("");
    setNewCodeExample("");
    setShowNewCode(false);
  };

  const createCode = async () => {
    if (!newCodeLabel.trim() || !projectId) return;
    const theory = theories.find(t => t.id === newCodeTheoryId);
    const { error } = await supabase.from("codes").insert({
      project_id: projectId,
      label: newCodeLabel.trim(),
      created_by: userId,
      theory_id: newCodeTheoryId || null,
      color: theory ? theory.color : null,
      origin: newCodeOrigin || "researcher",
      definition: newCodeDefinition || null,
      inclusion_criteria: newCodeInclusion || null,
      exclusion_criteria: newCodeExclusion || null,
      example_quote: newCodeExample || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Code created");
    await logActivity(projectId, userId, "code_created", `Created code "${newCodeLabel.trim()}"`);
    resetNewCodeForm();
    loadCodes();
  };

  const getTheoryForCode = (code: CodeWithDetails) => theories.find(t => t.id === code.theory_id);

  if (authLoading || loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-muted-foreground">Loading codebook…</p></div>;
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
              <p className="text-[11px] text-muted-foreground">{codes.length} codes</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setFeedOpen(!feedOpen)}>
              <Activity className="mr-1.5 h-3.5 w-3.5" />Activity
            </Button>
            <Button size="sm" onClick={() => setShowNewCode(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />New Code
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="codebook" className="flex h-full flex-col">
          <div className="border-b border-border px-6">
            <TabsList className="bg-transparent h-auto p-0 gap-4">
              <TabsTrigger value="codebook" className="rounded-none border-b-2 border-transparent px-0 pb-2 pt-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                Codebook
              </TabsTrigger>
              <TabsTrigger value="consistency" className="rounded-none border-b-2 border-transparent px-0 pb-2 pt-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                Consistency
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Codebook Tab */}
          <TabsContent value="codebook" className="flex-1 overflow-auto m-0">
            <ScrollArea className="h-full">
              <div className="mx-auto max-w-[1000px] p-6">
                {showNewCode && (
                  <div className="mb-4 rounded-lg border border-primary/30 bg-card p-5 space-y-4">
                    <p className="text-sm font-medium text-foreground">Create New Code</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Code Label *</label>
                        <Input placeholder="New code label…" value={newCodeLabel} onChange={(e) => setNewCodeLabel(e.target.value)} autoFocus />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Origin</label>
                        <Select value={newCodeOrigin} onValueChange={setNewCodeOrigin}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ORIGIN_OPTIONS.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {theories.length > 0 && (
                      <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Theory</label>
                        <Select value={newCodeTheoryId} onValueChange={setNewCodeTheoryId}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Link to theory (optional)" /></SelectTrigger>
                          <SelectContent>
                            {theories.map(t => (
                              <SelectItem key={t.id} value={t.id}>
                                <span className="flex items-center gap-2">
                                  <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ backgroundColor: t.color }} />
                                  {t.name}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div>
                      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Definition</label>
                      <Textarea value={newCodeDefinition} onChange={(e) => setNewCodeDefinition(e.target.value)} rows={2} className="text-sm" placeholder="What does this code mean?" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Inclusion criteria</label>
                        <Textarea value={newCodeInclusion} onChange={(e) => setNewCodeInclusion(e.target.value)} rows={2} className="text-sm" placeholder="When to apply…" />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Exclusion criteria</label>
                        <Textarea value={newCodeExclusion} onChange={(e) => setNewCodeExclusion(e.target.value)} rows={2} className="text-sm" placeholder="When NOT to apply…" />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Example quote</label>
                      <Textarea value={newCodeExample} onChange={(e) => setNewCodeExample(e.target.value)} rows={2} className="text-sm italic" placeholder="Verbatim excerpt..." />
                    </div>
                    <div className="flex gap-2 justify-end pt-1">
                      <Button size="sm" variant="ghost" onClick={resetNewCodeForm}>Cancel</Button>
                      <Button size="sm" onClick={createCode} disabled={!newCodeLabel.trim()}>Create Code</Button>
                    </div>
                  </div>
                )}
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-8"></TableHead>
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead className="w-32">Theory</TableHead>
                        <TableHead className="w-28">Origin</TableHead>
                        <TableHead className="w-20 text-right">Freq.</TableHead>
                        <TableHead className="w-16 text-center">By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {codes.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="py-16 text-center text-sm text-muted-foreground">
                            No codes yet. Create your first code to start building the codebook.
                          </TableCell>
                        </TableRow>
                      ) : codes.map((code) => {
                        const isExpanded = expandedId === code.id;
                        const partnerIsHere = partnerEditing === code.id;
                        const theory = getTheoryForCode(code);
                        return (
                          <>
                            <TableRow key={code.id} className="cursor-pointer" onClick={() => expandCode(code)}>
                              <TableCell className="px-2">
                                {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                              </TableCell>
                              <TableCell className="px-2">
                                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: code.color || "hsl(var(--primary))" }} />
                              </TableCell>
                              <TableCell className="font-medium text-foreground">{code.label}</TableCell>
                              <TableCell>
                                {theory && (
                                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: theory.color }} />
                                    {theory.name}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-[10px]">
                                  {(code.origin || "researcher").replace("_", " ").toUpperCase()}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right text-xs text-muted-foreground tabular-nums">{appCounts[code.id] || 0}</TableCell>
                              <TableCell className="text-center">
                                {code.created_by && <span className="text-[10px] text-primary">{code.created_by === userId ? "A" : "B"}</span>}
                              </TableCell>
                            </TableRow>
                            {isExpanded && (
                              <TableRow key={`${code.id}-expanded`} className="hover:bg-transparent">
                                <TableCell colSpan={7} className="bg-secondary/30 px-8 py-4">
                                  {partnerIsHere && (
                                    <div className="mb-3 flex items-center gap-2 rounded-sm border border-destructive/30 px-3 py-2 text-xs text-destructive">
                                      <AlertTriangle className="h-3.5 w-3.5" /> Your partner is editing this entry
                                    </div>
                                  )}
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Theory</label>
                                        <Select value={editState.theory_id || ""} onValueChange={(v) => setEditState(s => ({ ...s, theory_id: v }))}>
                                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select theory" /></SelectTrigger>
                                          <SelectContent>
                                            {theories.map(t => (
                                              <SelectItem key={t.id} value={t.id}>
                                                <span className="flex items-center gap-2">
                                                  <span className="h-2.5 w-2.5 rounded-full inline-block" style={{ backgroundColor: t.color }} />
                                                  {t.name}
                                                </span>
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div>
                                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Origin</label>
                                        <Select value={editState.origin || "researcher"} onValueChange={(v) => setEditState(s => ({ ...s, origin: v }))}>
                                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                                          <SelectContent>
                                            {ORIGIN_OPTIONS.map(o => (
                                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>
                                    <div>
                                      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Definition</label>
                                      <Textarea value={editState.definition ?? ""} onChange={(e) => setEditState((s) => ({ ...s, definition: e.target.value }))} rows={2} className="text-sm" placeholder="What does this code mean?" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Inclusion criteria</label>
                                        <Textarea value={editState.inclusion_criteria ?? ""} onChange={(e) => setEditState((s) => ({ ...s, inclusion_criteria: e.target.value }))} rows={2} className="text-sm" placeholder="When to apply…" />
                                      </div>
                                      <div>
                                        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Exclusion criteria</label>
                                        <Textarea value={editState.exclusion_criteria ?? ""} onChange={(e) => setEditState((s) => ({ ...s, exclusion_criteria: e.target.value }))} rows={2} className="text-sm" placeholder="When NOT to apply…" />
                                      </div>
                                    </div>
                                    <div>
                                      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Example quote</label>
                                      <Textarea value={editState.example_quote ?? ""} onChange={(e) => setEditState((s) => ({ ...s, example_quote: e.target.value }))} rows={2} className="text-sm italic" placeholder="Verbatim excerpt..." />
                                    </div>
                                    <div className="flex justify-end">
                                      <Button size="sm" onClick={() => saveCodeDetails(code.id)}>Save</Button>
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
          </TabsContent>

          <TabsContent value="consistency" className="flex-1 overflow-auto m-0">
            <ScrollArea className="h-full">
              <div className="mx-auto max-w-[1000px] p-6">
                <ConsistencyTab projectId={projectId!} userId={userId} />
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>

      <ActivityFeed projectId={projectId!} open={feedOpen} onClose={() => setFeedOpen(false)} />
    </div>
  );
};

export default Codebook;
