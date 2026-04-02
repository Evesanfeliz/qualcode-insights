import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ArrowLeft, Sparkles, Loader2, Quote } from "lucide-react";
import { toast } from "sonner";

type Transcript = { id: string; project_id: string; participant_pseudonym: string; content: string };
type Code = { id: string; project_id: string; label: string; color: string | null; origin: string | null };
type CodeApplication = { id: string; code_id: string; transcript_id: string; applied_by: string; segment_text: string; start_index: number; end_index: number; note: string | null };
type ProjectMember = { user_id: string; role: string | null; color_theme: string | null };
type Project = { id: string; research_question: string | null; domain_framework: string | null; approach: string | null };
type AISuggestion = { label: string; justification: string; domain_connection: string; confidence: "high" | "medium" | "low" };

const confidenceBadge: Record<string, string> = {
  high: "border-primary/40 text-primary",
  medium: "border-warning/40 text-warning",
  low: "border-muted-foreground/30 text-muted-foreground",
};

const originBadgeStyles: Record<string, { label: string; className: string } | null> = {
  in_vivo: { label: "IN VIVO", className: "border-primary/50 text-primary" },
  researcher: null,
  a_priori: { label: "A PRIORI", className: "border-indigo-400/50 text-indigo-400" },
  ai_suggested: { label: "AI", className: "border-amber-400/50 text-amber-400" },
};

const CodingWorkspace = () => {
  const { projectId, transcriptId } = useParams<{ projectId: string; transcriptId: string }>();
  const navigate = useNavigate();
  const contentRef = useRef<HTMLDivElement>(null);

  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [codes, setCodes] = useState<Code[]>([]);
  const [applications, setApplications] = useState<CodeApplication[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);

  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const [newCodeLabel, setNewCodeLabel] = useState("");
  const [selectedCodeId, setSelectedCodeId] = useState("");
  const [popoverOpen, setPopoverOpen] = useState(false);

  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [showInVivoTooltip, setShowInVivoTooltip] = useState(false);

  const loadData = useCallback(async () => {
    if (!projectId || !transcriptId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }
      setCurrentUserId(user.id);

      const [tRes, pRes, cRes, aRes, mRes] = await Promise.all([
        supabase.from("transcripts").select("id, project_id, participant_pseudonym, content").eq("id", transcriptId).single(),
        supabase.from("projects").select("id, research_question, domain_framework, approach").eq("id", projectId).single(),
        supabase.from("codes").select("*").eq("project_id", projectId).order("label"),
        supabase.from("code_applications").select("*").eq("transcript_id", transcriptId),
        supabase.from("project_members").select("user_id, role, color_theme").eq("project_id", projectId),
      ]);

      if (tRes.error) throw tRes.error;
      setTranscript(tRes.data as Transcript);
      if (pRes.data) setProject(pRes.data as Project);
      setCodes((cRes.data ?? []) as Code[]);
      setApplications((aRes.data ?? []) as CodeApplication[]);
      setMembers((mRes.data ?? []) as ProjectMember[]);
    } catch (err: any) {
      toast.error("Failed to load workspace");
    } finally {
      setLoading(false);
    }
  }, [projectId, transcriptId, navigate]);

  useEffect(() => { loadData(); }, [loadData]);

  const getHighlightColor = (userId: string) => {
    const memberIdx = members.findIndex((m) => m.user_id === userId);
    if (memberIdx === 0) return "rgba(14, 158, 138, 0.18)";
    if (memberIdx === 1) return "rgba(74, 108, 247, 0.18)";
    return "rgba(14, 158, 138, 0.18)";
  };

  const getHighlightBorder = (userId: string) => {
    const memberIdx = members.findIndex((m) => m.user_id === userId);
    if (memberIdx === 0) return "hsl(var(--primary))";
    if (memberIdx === 1) return "hsl(var(--accent))";
    return "hsl(var(--primary))";
  };

  const renderedContent = useMemo(() => {
    if (!transcript) return null;
    const text = transcript.content;
    if (applications.length === 0) return text;
    const sorted = [...applications].sort((a, b) => a.start_index - b.start_index);
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    sorted.forEach((app) => {
      if (app.start_index > cursor) parts.push(text.slice(cursor, app.start_index));
      const code = codes.find((c) => c.id === app.code_id);
      const codeLabel = code?.label || "?";
      const isInVivo = code?.origin === "in_vivo";
      parts.push(
        <mark
          key={app.id}
          style={{
            backgroundColor: getHighlightColor(app.applied_by),
            borderLeft: `2px solid ${getHighlightBorder(app.applied_by)}`,
            paddingLeft: "4px",
            position: "relative",
          }}
          className="group/mark rounded-none"
          title={`${codeLabel} — "${app.segment_text}"`}
        >
          {text.slice(app.start_index, app.end_index)}
          {isInVivo && (
            <span
              className="absolute -top-0.5 -right-0.5 opacity-0 group-hover/mark:opacity-100 transition-opacity font-mono text-[10px] uppercase leading-none pointer-events-none"
              style={{ color: code?.color || "hsl(var(--primary))" }}
            >
              IV
            </span>
          )}
        </mark>
      );
      cursor = app.end_index;
    });
    if (cursor < text.length) parts.push(text.slice(cursor));
    return parts;
  }, [transcript, applications, codes, members]);

  const handleMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !contentRef.current || !transcript) return;
    const range = sel.getRangeAt(0);
    const selectedText = sel.toString().trim();
    if (!selectedText) return;
    const preRange = document.createRange();
    preRange.selectNodeContents(contentRef.current);
    preRange.setEnd(range.startContainer, range.startOffset);
    const startIndex = preRange.toString().length;
    const endIndex = startIndex + sel.toString().length;
    const rect = range.getBoundingClientRect();
    setPopoverPos({ x: rect.left + rect.width / 2, y: rect.top - 10 });
    setSelection({ start: startIndex, end: endIndex, text: selectedText });
    setPopoverOpen(true);
    setNewCodeLabel("");
    setSelectedCodeId("");
    setAiSuggestions([]);
  };

  const askAI = async () => {
    if (!selection || !transcript) return;
    setAiLoading(true);
    setAiSuggestions([]);
    try {
      const text = transcript.content;
      const beforeText = text.slice(Math.max(0, selection.start - 300), selection.start);
      const afterText = text.slice(selection.end, Math.min(text.length, selection.end + 300));
      const beforeLines = beforeText.split("\n").slice(-3).join("\n");
      const afterLines = afterText.split("\n").slice(0, 3).join("\n");

      const { data, error } = await supabase.functions.invoke("ai-suggest-codes", {
        body: {
          research_question: project?.research_question || "",
          domain_framework: project?.domain_framework || "",
          approach: project?.approach || "",
          existing_codes: codes.map((c) => c.label).join(", "),
          selected_text: selection.text,
          surrounding_context: `${beforeLines}\n[SELECTED]\n${afterLines}`,
        },
      });
      if (error) throw error;
      if (data?.suggestions) {
        setAiSuggestions(data.suggestions);
      } else if (data?.error) {
        toast.error(data.error);
      }
    } catch (err: any) {
      toast.error(err.message || "AI suggestion failed");
    } finally {
      setAiLoading(false);
    }
  };

  const applyCode = async (originOverride?: string) => {
    if (!selection || !transcript || !projectId) return;
    try {
      let codeId = selectedCodeId;
      if (newCodeLabel.trim() && !selectedCodeId) {
        const origin = originOverride || "researcher";
        const { data, error } = await supabase.from("codes").insert({ project_id: projectId, label: newCodeLabel.trim(), origin }).select().single();
        if (error) throw error;
        codeId = data.id;
      }
      if (!codeId) { toast.error("Please enter a new code name or select an existing one"); return; }
      const { error } = await supabase.from("code_applications").insert({
        code_id: codeId, transcript_id: transcript.id, applied_by: currentUserId,
        segment_text: selection.text, start_index: selection.start, end_index: selection.end,
      });
      if (error) throw error;
      toast.success("Code applied!");
      setPopoverOpen(false);
      setSelection(null);
      setAiSuggestions([]);
      window.getSelection()?.removeAllRanges();
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to apply code");
    }
  };

  const applyInVivo = async () => {
    if (!selection || !transcript || !projectId) return;
    try {
      let label = selection.text;
      let truncated = false;
      if (label.length > 60) {
        label = label.slice(0, 60) + "…";
        truncated = true;
      }

      // Check for existing code with same label
      const existing = codes.find((c) => c.label === label);
      let codeId: string;

      if (existing) {
        codeId = existing.id;
      } else {
        const { data, error } = await supabase.from("codes").insert({
          project_id: projectId, label, origin: "in_vivo",
        }).select().single();
        if (error) throw error;
        codeId = data.id;
      }

      const { error } = await supabase.from("code_applications").insert({
        code_id: codeId, transcript_id: transcript.id, applied_by: currentUserId,
        segment_text: selection.text, start_index: selection.start, end_index: selection.end,
      });
      if (error) throw error;

      if (truncated) {
        toast.info("Code label truncated to 60 chars. The full passage is still saved as the coded segment.");
      } else {
        toast.success("In vivo code applied!");
      }

      // Show educational tooltip on first use
      const hasSeenTooltip = localStorage.getItem("invivo_tooltip_seen");
      const hadInVivoBefore = codes.some((c) => c.origin === "in_vivo");
      if (!hasSeenTooltip && !hadInVivoBefore) {
        setShowInVivoTooltip(true);
      }

      setPopoverOpen(false);
      setSelection(null);
      setAiSuggestions([]);
      window.getSelection()?.removeAllRanges();
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to apply in vivo code");
    }
  };

  const codeFrequency = useMemo(() => {
    const freq: Record<string, number> = {};
    applications.forEach((a) => { freq[a.code_id] = (freq[a.code_id] || 0) + 1; });
    return freq;
  }, [applications]);

  const scrollToCode = (codeId: string) => {
    const app = applications.find((a) => a.code_id === codeId);
    if (!app || !contentRef.current) return;
    const marks = contentRef.current.querySelectorAll("mark");
    for (const mark of marks) {
      const title = mark.getAttribute("title") || "";
      const codeLabel = codes.find((c) => c.id === codeId)?.label || "";
      if (title.startsWith(codeLabel)) {
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
        mark.style.outline = "2px solid hsl(var(--primary))";
        setTimeout(() => { mark.style.outline = "none"; }, 1500);
        break;
      }
    }
  };

  const truncatePreview = (text: string, max: number) =>
    text.length > max ? `${text.slice(0, max)}…` : text;

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-muted-foreground">Loading workspace…</p></div>;
  if (!transcript) return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-muted-foreground">Transcript not found.</p></div>;

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card px-5 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}/transcripts`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="font-body text-sm font-semibold text-foreground tracking-wide-sm">Coding Workspace</h1>
            <span className="text-muted-foreground">·</span>
            <span className="text-sm text-muted-foreground">{transcript.participant_pseudonym}</span>
          </div>
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Transcript panel */}
        <ResizablePanel defaultSize={60} minSize={40}>
          <ScrollArea className="h-full">
            <div className="p-8">
              <div
                ref={contentRef}
                className="whitespace-pre-wrap font-body text-[14px] leading-[1.8] text-foreground selection:bg-primary/20"
                onMouseUp={handleMouseUp}
              >
                {renderedContent}
              </div>
            </div>

            {/* Floating popover */}
            {popoverOpen && popoverPos && (
              <div className="fixed z-50" style={{ left: Math.max(10, popoverPos.x - 160), top: Math.max(10, popoverPos.y - (aiSuggestions.length > 0 ? 480 : 270)) }}>
                <div className="w-[320px] rounded-lg border border-border bg-card p-4 shadow-lg">
                  <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Apply code to selection</p>
                  <div className="space-y-3">
                    <Input placeholder="New code name..." value={newCodeLabel} onChange={(e) => { setNewCodeLabel(e.target.value); if (e.target.value) setSelectedCodeId(""); }} className="h-8 text-sm" />
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">or</span>
                      <Select value={selectedCodeId} onValueChange={(v) => { setSelectedCodeId(v); if (v) setNewCodeLabel(""); }}>
                        <SelectTrigger className="h-8 text-sm flex-1"><SelectValue placeholder="Existing code" /></SelectTrigger>
                        <SelectContent>{codes.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" className="flex-1" onClick={() => { setPopoverOpen(false); setSelection(null); setAiSuggestions([]); window.getSelection()?.removeAllRanges(); }}>Cancel</Button>
                      <Button size="sm" variant="outline" className="gap-1" onClick={askAI} disabled={aiLoading}>
                        {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Ask AI
                      </Button>
                      <Button size="sm" className="flex-1" onClick={() => applyCode()}>Apply</Button>
                    </div>

                    {/* In Vivo button */}
                    {selection && (
                      <button
                        onClick={applyInVivo}
                        className="w-full rounded-md border border-primary/50 bg-transparent px-3 py-2 text-left transition-colors hover:bg-primary/10"
                      >
                        <div className="flex items-center gap-2">
                          <Quote className="h-3.5 w-3.5 shrink-0 text-primary" />
                          <span className="text-sm font-medium text-primary">Use exact words</span>
                        </div>
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground truncate">
                          "{truncatePreview(selection.text, 40)}"
                        </p>
                      </button>
                    )}
                  </div>

                  {aiSuggestions.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">AI Suggestions</p>
                      {aiSuggestions.map((s, i) => (
                        <button
                          key={i}
                          className="w-full rounded-sm border border-border bg-secondary/50 p-2.5 text-left transition-colors hover:bg-secondary"
                          onClick={() => { setNewCodeLabel(s.label); setSelectedCodeId(""); }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-foreground">{s.label}</span>
                            <Badge variant="outline" className={`${confidenceBadge[s.confidence]}`}>{s.confidence}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{s.justification}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  {aiLoading && (
                    <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Analyzing segment…</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </ScrollArea>
        </ResizablePanel>

        <ResizableHandle />

        {/* Codes panel */}
        <ResizablePanel defaultSize={40} minSize={25}>
          <div className="flex h-full flex-col border-l border-border bg-card">
            <div className="border-b border-border px-6 py-4">
              <h2 className="font-body text-sm font-semibold text-foreground">Codes</h2>
              <p className="font-mono text-[10px] text-muted-foreground mt-0.5">{codes.length} codes · {applications.length} applications</p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-0.5">
                {codes.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">No codes yet. Select text to create your first code.</p>
                ) : codes.map((code) => {
                  const badge = originBadgeStyles[code.origin || "researcher"];
                  return (
                    <button key={code.id} onClick={() => scrollToCode(code.id)} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors hover:bg-secondary">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: code.color || "hsl(var(--primary))" }} />
                      <span className="flex-1 truncate text-foreground font-body">{code.label}</span>
                      {badge && (
                        <span className={`shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase leading-none ${badge.className}`}>
                          {badge.label}
                        </span>
                      )}
                      <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{codeFrequency[code.id] || 0}</span>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* In Vivo educational tooltip */}
      {showInVivoTooltip && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="w-[360px] rounded-md border border-primary/50 bg-popover p-6 shadow-xl">
            <h3 className="text-sm font-semibold text-foreground mb-2">In vivo code applied</h3>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              In vivo codes use the participant's exact words as the label.
              They preserve the participant's voice and often capture
              something a paraphrase would lose.
              Use them alongside your own interpretive codes —
              not as a replacement for analysis.
            </p>
            <Button
              size="sm"
              className="w-full"
              onClick={() => {
                localStorage.setItem("invivo_tooltip_seen", "true");
                setShowInVivoTooltip(false);
              }}
            >
              Got it
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CodingWorkspace;
