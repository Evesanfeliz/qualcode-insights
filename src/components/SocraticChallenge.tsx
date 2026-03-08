import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Send, X } from "lucide-react";
import { toast } from "sonner";

type SocraticChallengeProps = {
  projectId: string;
  userId: string;
  memoId: string;
  memoTitle: string;
  memoContent: string;
  onReplyAdded: () => void;
};

type Challenge = {
  challenge: string;
  challenge_type: string;
  data_reference: string;
};

const CHALLENGE_TYPE_BADGE: Record<string, string> = {
  contradiction: "border-destructive/40 text-destructive",
  gap: "border-warning/40 text-warning",
  assumption: "border-accent/40 text-accent",
  counter_evidence: "border-destructive/40 text-destructive",
};

export const SocraticChallenge = ({
  projectId,
  userId,
  memoId,
  memoTitle,
  memoContent,
  onReplyAdded,
}: SocraticChallengeProps) => {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [responses, setResponses] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [dialogueClosed, setDialogueClosed] = useState(false);
  const [round, setRound] = useState(0);

  const fetchChallenge = async (thread?: string) => {
    setLoading(true);
    try {
      // Fetch project info
      const { data: project } = await supabase
        .from("projects")
        .select("research_question, domain_framework")
        .eq("id", projectId)
        .single();

      // Fetch other memos
      const { data: otherMemos } = await supabase
        .from("memos")
        .select("title, content")
        .eq("project_id", projectId)
        .neq("id", memoId)
        .limit(10);

      const otherMemosText = (otherMemos || [])
        .map((m: any) => {
          const text = typeof m.content === "string" ? m.content : m.content?.text || "";
          return `${m.title}: ${text.slice(0, 200)}`;
        })
        .join("\n");

      const body: any = {
        research_question: project?.research_question,
        domain_framework: project?.domain_framework,
        memo_title: memoTitle,
        memo_content: memoContent,
        other_memos: otherMemosText,
      };

      if (thread) {
        body.thread = thread;
      }

      const { data, error } = await supabase.functions.invoke("ai-socratic-challenge", { body });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      setChallenges((prev) => [...prev, data as Challenge]);
      setRound((r) => r + 1);

      // Save AI challenge as a memo reply
      await supabase.from("memo_replies").insert({
        memo_id: memoId,
        author_id: userId,
        author_type: "claude",
        content: `[${data.challenge_type?.toUpperCase()}] ${data.challenge}\n\nData reference: ${data.data_reference}`,
      });
      onReplyAdded();
    } catch (err: any) {
      console.error("Socratic challenge failed:", err);
      toast.error("Challenge failed");
    } finally {
      setLoading(false);
    }
  };

  const submitResponse = async () => {
    if (!replyText.trim()) return;

    // Save researcher reply
    await supabase.from("memo_replies").insert({
      memo_id: memoId,
      author_id: userId,
      author_type: "researcher",
      content: replyText.trim(),
    });

    setResponses((prev) => [...prev, replyText.trim()]);
    setReplyText("");
    onReplyAdded();
  };

  const pushFurther = async () => {
    // Build thread text
    let thread = `MEMO: ${memoTitle}\n${memoContent}\n\n`;
    for (let i = 0; i < challenges.length; i++) {
      thread += `AI CHALLENGE (Round ${i + 1}): ${challenges[i].challenge}\n`;
      if (responses[i]) {
        thread += `RESEARCHER RESPONSE: ${responses[i]}\n\n`;
      }
    }
    await fetchChallenge(thread);
  };

  const closeDialogue = () => {
    setDialogueClosed(true);
    toast.success("Dialogue closed");
  };

  if (dialogueClosed) {
    return (
      <div className="mt-4 rounded-sm border border-border bg-secondary/30 px-4 py-3 text-center">
        <p className="text-xs text-muted-foreground">Socratic dialogue completed ({round} rounds)</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {/* Initial trigger */}
      {round === 0 && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => fetchChallenge()}
          disabled={loading}
          className="border-accent/40 text-accent hover:bg-accent/10"
        >
          {loading ? (
            <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Challenging…</>
          ) : (
            <><Sparkles className="mr-1.5 h-3 w-3" /> Challenge this memo</>
          )}
        </Button>
      )}

      {/* Dialogue thread */}
      {challenges.map((c, i) => (
        <div key={i} className="space-y-3">
          {/* AI Challenge */}
          <blockquote className="border-l-2 border-accent pl-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
                AI challenges (Round {i + 1})
              </span>
              <Badge variant="outline" className={CHALLENGE_TYPE_BADGE[c.challenge_type] || ""}>
                {c.challenge_type?.toUpperCase()}
              </Badge>
            </div>
            <p className="text-sm italic text-foreground leading-relaxed">{c.challenge}</p>
            <p className="text-xs text-muted-foreground">
              📌 {c.data_reference}
            </p>
          </blockquote>

          {/* Researcher response (if exists) */}
          {responses[i] && (
            <div className="ml-4 rounded-sm border border-border bg-secondary/30 px-3 py-2">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Your response</p>
              <p className="text-sm text-foreground">{responses[i]}</p>
            </div>
          )}

          {/* Reply area for current round (last challenge without response) */}
          {i === challenges.length - 1 && !responses[i] && (
            <div className="ml-4 space-y-2">
              <div className="flex gap-2">
                <Input
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Respond to this challenge…"
                  className="flex-1"
                  onKeyDown={(e) => e.key === "Enter" && submitResponse()}
                />
                <Button size="icon" onClick={submitResponse} disabled={!replyText.trim()}>
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Push further / Close buttons */}
      {round > 0 && responses.length === challenges.length && (
        <div className="flex items-center gap-2 ml-4">
          {round < 3 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={pushFurther}
              disabled={loading}
              className="border-accent/40 text-accent hover:bg-accent/10"
            >
              {loading ? (
                <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Thinking…</>
              ) : (
                <><Sparkles className="mr-1.5 h-3 w-3" /> Push further</>
              )}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={closeDialogue}>
            <X className="mr-1.5 h-3 w-3" /> Close dialogue
          </Button>
        </div>
      )}
    </div>
  );
};
