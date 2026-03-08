import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useProjectRealtime, useTableRealtime } from "@/hooks/useProjectRealtime";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { logActivity } from "@/lib/activity";
import { ActivityFeed } from "@/components/ActivityFeed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, FileText, Activity, Send } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Memo = {
  id: string;
  project_id: string;
  author_id: string;
  title: string;
  content: any;
  memo_type: string;
  depth_score: string | null;
  linked_code_id: string | null;
  linked_transcript_id: string | null;
  created_at: string;
  updated_at: string;
};

type MemoReply = {
  id: string;
  memo_id: string;
  author_id: string;
  author_type: string;
  content: string;
  created_at: string;
};

type Code = {
  id: string;
  label: string;
};

const DEPTH_LABELS: Record<string, string> = { D: "Descriptive", I: "Interpretive", T: "Theoretical" };

const MemoPad = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { userId, loading: authLoading } = useCurrentUser();

  const [memos, setMemos] = useState<Memo[]>([]);
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
  const [replies, setReplies] = useState<MemoReply[]>([]);
  const [codes, setCodes] = useState<Code[]>([]);
  const [feedOpen, setFeedOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Editor state
  const [title, setTitle] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [depthScore, setDepthScore] = useState<string>("");
  const [linkedCodeId, setLinkedCodeId] = useState<string>("");
  const [memoType, setMemoType] = useState("general");

  // Reply state
  const [replyText, setReplyText] = useState("");

  const selectedMemo = memos.find((m) => m.id === selectedMemoId);

  const loadMemos = useCallback(async () => {
    if (!projectId) return;
    const [memosRes, codesRes] = await Promise.all([
      supabase.from("memos").select("*").eq("project_id", projectId).order("updated_at", { ascending: false }),
      supabase.from("codes").select("id, label").eq("project_id", projectId).order("label"),
    ]);
    if (memosRes.data) setMemos(memosRes.data as Memo[]);
    if (codesRes.data) setCodes(codesRes.data as Code[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadMemos(); }, [loadMemos]);
  useProjectRealtime("memos", projectId, loadMemos);

  // Load replies when a memo is selected
  const loadReplies = useCallback(async () => {
    if (!selectedMemoId) return;
    const { data } = await supabase
      .from("memo_replies")
      .select("*")
      .eq("memo_id", selectedMemoId)
      .order("created_at", { ascending: true });
    if (data) setReplies(data as MemoReply[]);
  }, [selectedMemoId]);

  useEffect(() => { loadReplies(); }, [loadReplies]);
  useTableRealtime("memo_replies", "memo_id", selectedMemoId ?? undefined, loadReplies);

  // When selecting a memo, populate editor
  useEffect(() => {
    if (selectedMemo) {
      setTitle(selectedMemo.title);
      setBodyText(typeof selectedMemo.content === "string" ? selectedMemo.content : (selectedMemo.content?.text ?? ""));
      setDepthScore(selectedMemo.depth_score ?? "");
      setLinkedCodeId(selectedMemo.linked_code_id ?? "");
      setMemoType(selectedMemo.memo_type ?? "general");
    }
  }, [selectedMemoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const createMemo = async () => {
    if (!projectId || !userId) return;
    const { data, error } = await supabase
      .from("memos")
      .insert({
        project_id: projectId,
        author_id: userId,
        title: "Untitled Memo",
        content: { text: "" },
      })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    await logActivity(projectId, userId, "memo_written", "Created a new memo");
    setSelectedMemoId((data as Memo).id);
    loadMemos();
  };

  const saveMemo = async () => {
    if (!selectedMemoId) return;
    const { error } = await supabase.from("memos").update({
      title,
      content: { text: bodyText },
      depth_score: depthScore || null,
      linked_code_id: linkedCodeId || null,
      memo_type: memoType,
    }).eq("id", selectedMemoId);
    if (error) { toast.error(error.message); return; }
    toast.success("Memo saved");
    loadMemos();
  };

  const submitReply = async () => {
    if (!replyText.trim() || !selectedMemoId || !userId) return;
    const { error } = await supabase.from("memo_replies").insert({
      memo_id: selectedMemoId,
      author_id: userId,
      author_type: "researcher",
      content: replyText.trim(),
    });
    if (error) { toast.error(error.message); return; }
    setReplyText("");
    loadReplies();
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary">
        <p className="text-muted-foreground">Loading memos…</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}/transcripts`)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="font-heading text-base font-bold text-primary">Memo Pad</h1>
              <p className="text-xs text-muted-foreground">{memos.length} memos</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setFeedOpen(!feedOpen)}>
              <Activity className="mr-1.5 h-3.5 w-3.5" />
              Activity
            </Button>
            <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={createMemo}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Memo
            </Button>
          </div>
        </div>
      </header>

      {/* Body: sidebar + main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — memo list */}
        <div className="w-72 shrink-0 border-r border-border bg-card">
          <ScrollArea className="h-full">
            <div className="space-y-0.5 p-2">
              {memos.map((memo) => {
                const linkedCode = codes.find((c) => c.id === memo.linked_code_id);
                return (
                  <button
                    key={memo.id}
                    onClick={() => setSelectedMemoId(memo.id)}
                    className={`flex w-full flex-col gap-1 rounded-md px-3 py-2.5 text-left transition-colors ${
                      selectedMemoId === memo.id ? "bg-accent/10 border border-accent/30" : "hover:bg-secondary"
                    }`}
                  >
                    <span className="text-sm font-medium text-foreground truncate">{memo.title}</span>
                    <div className="flex items-center gap-1.5">
                      {linkedCode && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{linkedCode.label}</Badge>
                      )}
                      {memo.depth_score && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{memo.depth_score}</Badge>
                      )}
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(memo.updated_at), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="flex h-4 w-4 items-center justify-center rounded-full bg-accent/15 text-[9px] font-semibold text-accent">
                        {memo.author_id === userId ? "A" : "B"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Main area — editor */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {selectedMemo ? (
            <>
              <div className="space-y-4 border-b border-border p-4">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="border-0 px-0 text-lg font-heading font-semibold text-foreground shadow-none focus-visible:ring-0"
                  placeholder="Memo title…"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={depthScore} onValueChange={setDepthScore}>
                    <SelectTrigger className="h-7 w-36 text-xs">
                      <SelectValue placeholder="Depth…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="D">D — Descriptive</SelectItem>
                      <SelectItem value="I">I — Interpretive</SelectItem>
                      <SelectItem value="T">T — Theoretical</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={linkedCodeId} onValueChange={setLinkedCodeId}>
                    <SelectTrigger className="h-7 w-44 text-xs">
                      <SelectValue placeholder="Link to code…" />
                    </SelectTrigger>
                    <SelectContent>
                      {codes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={saveMemo}>
                    Save
                  </Button>
                </div>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-4">
                  <Textarea
                    value={bodyText}
                    onChange={(e) => setBodyText(e.target.value)}
                    rows={12}
                    className="min-h-[200px] resize-none border-0 text-sm leading-7 shadow-none focus-visible:ring-0"
                    placeholder="Write your memo here…"
                  />
                </div>

                {/* Replies thread */}
                <div className="border-t border-border p-4">
                  <h3 className="mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Discussion</h3>
                  <div className="space-y-3">
                    {replies.map((r) => (
                      <div key={r.id} className="flex gap-2">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10px] font-semibold text-accent">
                          {r.author_id === userId ? "A" : "B"}
                        </div>
                        <div className="flex-1 rounded-md bg-secondary px-3 py-2">
                          <p className="text-sm text-foreground">{r.content}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Input
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Reply…"
                      className="flex-1"
                      onKeyDown={(e) => e.key === "Enter" && submitReply()}
                    />
                    <Button size="icon" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={submitReply}>
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <FileText className="mx-auto h-10 w-10 text-muted-foreground/30" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Select a memo or create a new one
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <ActivityFeed projectId={projectId!} open={feedOpen} onClose={() => setFeedOpen(false)} />
    </div>
  );
};

export default MemoPad;
