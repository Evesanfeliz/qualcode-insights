import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, Hash } from "lucide-react";
import { toast } from "sonner";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";

type Transcript = {
  id: string;
  project_id: string;
  participant_pseudonym: string;
  content: string;
};

type Code = {
  id: string;
  project_id: string;
  label: string;
  color: string | null;
};

type CodeApplication = {
  id: string;
  code_id: string;
  transcript_id: string;
  applied_by: string;
  segment_text: string;
  start_index: number;
  end_index: number;
  note: string | null;
};

type ProjectMember = {
  user_id: string;
  role: string | null;
  color_theme: string | null;
};

const CodingWorkspace = () => {
  const { projectId, transcriptId } = useParams<{ projectId: string; transcriptId: string }>();
  const navigate = useNavigate();
  const contentRef = useRef<HTMLDivElement>(null);

  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [codes, setCodes] = useState<Code[]>([]);
  const [applications, setApplications] = useState<CodeApplication[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Selection state
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const [newCodeLabel, setNewCodeLabel] = useState("");
  const [selectedCodeId, setSelectedCodeId] = useState("");
  const [popoverOpen, setPopoverOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!projectId || !transcriptId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }
      setCurrentUserId(user.id);

      const [tRes, cRes, aRes, mRes] = await Promise.all([
        supabase.from("transcripts").select("id, project_id, participant_pseudonym, content").eq("id", transcriptId).single(),
        supabase.from("codes").select("*").eq("project_id", projectId).order("label"),
        supabase.from("code_applications").select("*").eq("transcript_id", transcriptId),
        supabase.from("project_members").select("user_id, role, color_theme").eq("project_id", projectId),
      ]);

      if (tRes.error) throw tRes.error;
      setTranscript(tRes.data as Transcript);
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

  // Get researcher color based on who applied the code
  const getHighlightColor = (userId: string) => {
    const memberIdx = members.findIndex((m) => m.user_id === userId);
    // Researcher A = teal, Researcher B = indigo
    if (memberIdx === 0) return "rgba(10, 124, 110, 0.3)";
    if (memberIdx === 1) return "rgba(61, 78, 138, 0.3)";
    return "rgba(10, 124, 110, 0.3)";
  };

  // Build highlighted content
  const renderedContent = useMemo(() => {
    if (!transcript) return null;
    const text = transcript.content;
    if (applications.length === 0) return text;

    // Sort applications by start_index
    const sorted = [...applications].sort((a, b) => a.start_index - b.start_index);

    const parts: React.ReactNode[] = [];
    let cursor = 0;

    sorted.forEach((app, i) => {
      if (app.start_index > cursor) {
        parts.push(text.slice(cursor, app.start_index));
      }
      const codeLabel = codes.find((c) => c.id === app.code_id)?.label || "?";
      parts.push(
        <mark
          key={app.id}
          style={{ backgroundColor: getHighlightColor(app.applied_by) }}
          className="rounded-sm px-0.5"
          title={`${codeLabel} — "${app.segment_text}"`}
        >
          {text.slice(app.start_index, app.end_index)}
        </mark>
      );
      cursor = app.end_index;
    });

    if (cursor < text.length) {
      parts.push(text.slice(cursor));
    }

    return parts;
  }, [transcript, applications, codes, members]);

  // Handle text selection
  const handleMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !contentRef.current || !transcript) return;

    const range = sel.getRangeAt(0);
    const selectedText = sel.toString().trim();
    if (!selectedText) return;

    // Calculate character offset within the transcript content
    const preRange = document.createRange();
    preRange.selectNodeContents(contentRef.current);
    preRange.setEnd(range.startContainer, range.startOffset);
    const startIndex = preRange.toString().length;
    const endIndex = startIndex + sel.toString().length;

    // Get position for popover
    const rect = range.getBoundingClientRect();
    setPopoverPos({ x: rect.left + rect.width / 2, y: rect.top - 10 });
    setSelection({ start: startIndex, end: endIndex, text: selectedText });
    setPopoverOpen(true);
    setNewCodeLabel("");
    setSelectedCodeId("");
  };

  const applyCode = async () => {
    if (!selection || !transcript || !projectId) return;

    try {
      let codeId = selectedCodeId;

      // If new code label provided, create new code
      if (newCodeLabel.trim() && !selectedCodeId) {
        const { data, error } = await supabase
          .from("codes")
          .insert({ project_id: projectId, label: newCodeLabel.trim() })
          .select()
          .single();
        if (error) throw error;
        codeId = data.id;
      }

      if (!codeId) {
        toast.error("Please enter a new code name or select an existing one");
        return;
      }

      const { error } = await supabase.from("code_applications").insert({
        code_id: codeId,
        transcript_id: transcript.id,
        applied_by: currentUserId,
        segment_text: selection.text,
        start_index: selection.start,
        end_index: selection.end,
      });
      if (error) throw error;

      toast.success("Code applied!");
      setPopoverOpen(false);
      setSelection(null);
      window.getSelection()?.removeAllRanges();
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to apply code");
    }
  };

  // Code frequency counts
  const codeFrequency = useMemo(() => {
    const freq: Record<string, number> = {};
    applications.forEach((a) => {
      freq[a.code_id] = (freq[a.code_id] || 0) + 1;
    });
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
        // Brief flash effect
        mark.style.outline = "2px solid hsl(var(--accent))";
        setTimeout(() => { mark.style.outline = "none"; }, 1500);
        break;
      }
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary">
        <p className="text-muted-foreground">Loading workspace…</p>
      </div>
    );
  }

  if (!transcript) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary">
        <p className="text-muted-foreground">Transcript not found.</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/project/${projectId}/transcripts`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-heading text-base font-bold text-primary">
              Coding Workspace
            </h1>
            <p className="text-xs text-muted-foreground">
              {transcript.participant_pseudonym}
            </p>
          </div>
        </div>
      </header>

      {/* Split Pane */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Left: Transcript Text */}
        <ResizablePanel defaultSize={60} minSize={40}>
          <ScrollArea className="h-full">
            <div className="relative p-6">
              <div
                ref={contentRef}
                className="whitespace-pre-wrap text-sm leading-7 text-foreground selection:bg-accent/20"
                onMouseUp={handleMouseUp}
              >
                {renderedContent}
              </div>

              {/* Floating popover for code application */}
              {popoverOpen && popoverPos && (
                <div
                  className="fixed z-50"
                  style={{ left: popoverPos.x - 140, top: popoverPos.y - 180 }}
                >
                  <div className="w-[280px] rounded-lg border border-border bg-card p-4 shadow-lg">
                    <p className="mb-3 text-xs font-medium text-muted-foreground">
                      Apply code to selection
                    </p>
                    <div className="space-y-3">
                      <Input
                        placeholder="New code name..."
                        value={newCodeLabel}
                        onChange={(e) => {
                          setNewCodeLabel(e.target.value);
                          if (e.target.value) setSelectedCodeId("");
                        }}
                        className="h-8 text-sm"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">or</span>
                        <Select
                          value={selectedCodeId}
                          onValueChange={(v) => {
                            setSelectedCodeId(v);
                            if (v) setNewCodeLabel("");
                          }}
                        >
                          <SelectTrigger className="h-8 text-sm flex-1">
                            <SelectValue placeholder="Existing code" />
                          </SelectTrigger>
                          <SelectContent>
                            {codes.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => {
                            setPopoverOpen(false);
                            setSelection(null);
                            window.getSelection()?.removeAllRanges();
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
                          onClick={applyCode}
                        >
                          Apply
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </Panel>

        {/* Resize Handle */}
        <PanelResizeHandle className="w-1 bg-border hover:bg-accent/30 transition-colors" />

        {/* Right: Code Panel */}
        <Panel defaultSize={40} minSize={25}>
          <div className="flex h-full flex-col border-l border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="font-heading text-sm font-semibold text-foreground">
                Codes
              </h2>
              <p className="text-xs text-muted-foreground">
                {codes.length} codes · {applications.length} applications
              </p>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-1">
                {codes.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    No codes yet. Select text to create your first code.
                  </p>
                ) : (
                  codes.map((code) => (
                    <button
                      key={code.id}
                      onClick={() => scrollToCode(code.id)}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-secondary"
                    >
                      <Hash className="h-3.5 w-3.5 shrink-0 text-accent" />
                      <span className="flex-1 truncate text-foreground">
                        {code.label}
                      </span>
                      <Badge variant="secondary" className="text-xs tabular-nums">
                        {codeFrequency[code.id] || 0}
                      </Badge>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
};

export default CodingWorkspace;
