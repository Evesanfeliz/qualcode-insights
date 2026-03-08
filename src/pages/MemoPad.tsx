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
import { ArrowLeft, Plus, FileText, Activity, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Memo = {
  id: string; project_id: string; author_id: string; title: string; content: any;
  memo_type: string; depth_score: string | null; linked_code_id: string | null;
  linked_transcript_id: string | null; created_at: string; updated_at: string;
};
type MemoReply = { id: string; memo_id: string; author_id: string; author_type: string; content: string; created_at: string };
type Code = { id: string; label: string };

const DEPTH_BADGE: Record<string, string> = {
  D: "border-muted-foreground/30 text-muted-foreground",
  I: "border-warning/40 text-warning",
  T: "border-primary/40 text-primary",
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

  const [title, setTitle] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [depthScore, setDepthScore] = useState<string>("");
  const [linkedCodeId, setLinkedCodeId] = useState<string>("");
  const [memoType, setMemoType] = useState("general");
  const [replyText, setReplyText] = useState("");

  const [scoring, setScoring] = useState(false);
  const [pushQuestion, setPushQuestion] = useState<string | null>(null);

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

  const loadReplies = useCallback(async () => {
    if (!selectedMemoId) return;
    const { data } = await supabase.from("memo_replies").select("*").eq("memo_id", selectedMemoId).order("created_at", { ascending: true });
    if (data) setReplies(data as MemoReply[]);
  }, [selectedMemoId]);

  useEffect(() => { loadReplies(); }, [loadReplies]);
  useTableRealtime("memo_replies", "memo_id", selectedMemoId ?? undefined, loadReplies);

  useEffect(() => {
    if (selectedMemo) {
      setTitle(selectedMemo.title);
      setBodyText(typeof selectedMemo.content === "string" ? selectedMemo.content : (selectedMemo.content?.text ?? ""));
      setDepthScore(selectedMemo.depth_score ?? "");
      setLinkedCodeId(selectedMemo.linked_code_id ?? "");
      setMemoType(selectedMemo.memo_type ?? "general");
      setPushQuestion(null);
    }
  }, [selectedMemoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const createMemo = async () => {
    if (!projectId || !userId) return;
    const { data, error } = await supabase.from("memos").insert({ project_id: projectId, author_id: userId, title: "Untitled Memo", content: { text: "" } }).select().single();
    if (error) { toast.error(error.message); return; }
    await logActivity(projectId, userId, "memo_written", "Created a new memo");
    setSelectedMemoId((data as Memo).id);
    loadMemos();
  };

  const saveMemo = async () => {
    if (!selectedMemoId) return;
    const { error } = await supabase.from("memos").update({
      title, content: { text: bodyText }, depth_score: depthScore || null,
      linked_code_id: linkedCodeId || null, memo_type: memoType,
    }).eq("id", selectedMemoId);
    if (error) { toast.error(error.message); return; }
    toast.success("Memo saved");
    loadMemos();

    if (bodyText.trim().length > 20) {
      scoreMemo();
    }
  };

  const scoreMemo = async () => {
    setScoring(true);
    setPushQuestion(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-score-memo", {
        body: { memo_title: title, memo_content: bodyText },
      });
      if (error) throw error;
      if (data?.score && ["D", "I", "T"].includes(data.score)) {
        await supabase.from("memos").update({ depth_score: data.score }).eq("id", selectedMemoId!);
        setDepthScore(data.score);
        setPushQuestion(data.push_question || null);
        loadMemos();
      } else if (data?.error) {
        toast.error(data.error);
      }
    } catch (err: any) {
      console.error("Memo scoring failed:", err);
    } finally {
      setScoring(false);
    }
  };

  const submitReply = async () => {
    if (!replyText.trim() || !selectedMemoId || !userId) return;
    const { error } = await supabase.from("memo_replies").insert({ memo_id: selectedMemoId, author_id: userId, author_type: "researcher", content: replyText.trim() });
    if (error) { toast.error(error.message); return; }
    setReplyText("");
    loadReplies();
  };

  if (authLoading || loading) return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-muted-foreground">Loading memos…</p></div>;

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}/transcripts`)}><ArrowLeft className="h-4 w-4" /></Button>
            <div>
              <h1 className="font-heading text-base text-foreground">Memo Pad</h1>
              <p className="font-mono text-[10px] text-muted-foreground">{memos.length} memos</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setFeedOpen(!feedOpen)}><Activity className="mr-1.5 h-3.5 w-3.5" />Activity</Button>
            <Button size="sm" onClick={createMemo}><Plus className="mr-1.5 h-3.5 w-3.5" />New Memo</Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar - 280px */}
        <div className="w-[280px] shrink-0 border-r border-border">
          <ScrollArea className="h-full">
            <div className="space-y-0.5 p-2">
              {memos.map((memo) => {
                const linkedCode = codes.find((c) => c.id === memo.linked_code_id);
                return (
                  <button key={memo.id} onClick={() => setSelectedMemoId(memo.id)}
                    className={`flex w-full flex-col gap-1.5 rounded-sm px-3 py-3 text-left transition-colors ${selectedMemoId === memo.id ? "bg-secondary border-l-2 border-l-primary" : "hover:bg-secondary/50"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{memo.title}</span>
                      {memo.depth_score && (
                        <span className={`shrink-0 font-mono text-[10px] font-medium ${DEPTH_BADGE[memo.depth_score]?.split(" ").pop() || "text-muted-foreground"}`}>
                          {memo.depth_score}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {linkedCode && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{linkedCode.label}</Badge>}
                      <span className="ml-auto text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(memo.updated_at), { addSuffix: true })}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Main editor */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {selectedMemo ? (
            <>
              <div className="space-y-4 border-b border-border p-6">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} className="border-0 px-0 font-heading text-xl text-foreground shadow-none focus-visible:ring-0" placeholder="Memo title…" />
                <div className="flex flex-wrap items-center gap-3">
                  {depthScore && (
                    <Badge variant="outline" className={DEPTH_BADGE[depthScore] || ""}>
                      {depthScore} — {DEPTH_LABELS[depthScore] || depthScore}
                    </Badge>
                  )}
                  {scoring && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Scoring…
                    </div>
                  )}
                  <Select value={linkedCodeId} onValueChange={setLinkedCodeId}>
                    <SelectTrigger className="h-7 w-44 text-xs"><SelectValue placeholder="Link to code…" /></SelectTrigger>
                    <SelectContent>{codes.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={saveMemo}>Save</Button>
                </div>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-6">
                  <Textarea value={bodyText} onChange={(e) => setBodyText(e.target.value)} rows={12} className="min-h-[200px] resize-none border-0 text-sm leading-7 shadow-none focus-visible:ring-0" placeholder="Write your memo here…" />

                  {/* Push question - blockquote style with teal left border */}
                  {pushQuestion && (
                    <blockquote className="mt-6 border-l-2 border-primary pl-4 italic text-sm text-muted-foreground leading-relaxed">
                      💡 {pushQuestion}
                    </blockquote>
                  )}
                </div>

                {/* Replies */}
                <div className="border-t border-border p-6">
                  <h3 className="mb-3 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Discussion</h3>
                  <div className="space-y-3">
                    {replies.map((r) => (
                      <div key={r.id} className="flex gap-2">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/30 font-mono text-[10px] font-medium text-primary">
                          {r.author_id === userId ? "A" : "B"}
                        </div>
                        <div className="flex-1 rounded-sm border border-border bg-secondary px-3 py-2">
                          <p className="text-sm text-foreground">{r.content}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Input value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Reply…" className="flex-1" onKeyDown={(e) => e.key === "Enter" && submitReply()} />
                    <Button size="icon" onClick={submitReply}><Send className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </ScrollArea>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <FileText className="mx-auto h-10 w-10 text-muted-foreground/20" />
                <p className="mt-3 text-sm text-muted-foreground">Select a memo or create a new one</p>
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
