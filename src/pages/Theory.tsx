import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Sparkles, Loader2, ChevronDown, ChevronRight, Check, Swords, ShieldAlert, PenLine } from "lucide-react";
import { toast } from "sonner";

type Proposition = {
  id: string;
  project_id: string;
  statement: string;
  supporting_codes: string[] | null;
  theoretical_significance: string | null;
  tensions: string | null;
  confidence: string | null;
  status: string;
  rival_evidence: any;
  researcher_responses: any;
  created_by: string | null;
  created_at: string;
};

type RivalItem = {
  segment_text: string;
  transcript_pseudonym: string;
  code_label: string;
  challenge_type: string;
  explanation: string;
};

const CONFIDENCE_BADGE: Record<string, string> = {
  strong: "border-success/40 text-success",
  tentative: "border-warning/40 text-warning",
  speculative: "border-muted-foreground/30 text-muted-foreground",
};

const CHALLENGE_BADGE: Record<string, string> = {
  direct_contradiction: "border-destructive/40 text-destructive",
  unexplained_case: "border-warning/40 text-warning",
  missing_variable: "border-accent/40 text-accent",
};

const Theory = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { userId, loading: authLoading } = useCurrentUser();

  const [propositions, setPropositions] = useState<Proposition[]>([]);
  const [loading, setLoading] = useState(true);
  const [emerging, setEmerging] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<Record<string, string[]>>({});

  // Readiness
  const [theoreticalMemoCount, setTheoreticalMemoCount] = useState(0);
  const [codedTranscriptCount, setCodedTranscriptCount] = useState(0);

  // Rival challenge
  const [challengingId, setChallengingId] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  // Researcher response to rival evidence
  const [respondingKey, setRespondingKey] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");

  const isReady = theoreticalMemoCount >= 3 && codedTranscriptCount >= 5;

  const loadData = useCallback(async () => {
    if (!projectId) return;
    const [propsRes, memosRes, transcriptsRes] = await Promise.all([
      supabase.from("theory_propositions").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
      supabase.from("memos").select("id, depth_score").eq("project_id", projectId).eq("depth_score", "T"),
      supabase.from("transcripts").select("id, status").eq("project_id", projectId).eq("status", "coded"),
    ]);
    if (propsRes.data) setPropositions(propsRes.data as Proposition[]);
    setTheoreticalMemoCount(memosRes.data?.length || 0);
    setCodedTranscriptCount(transcriptsRes.data?.length || 0);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  const emergeTheory = async () => {
    setEmerging(true);
    try {
      const { data: project } = await supabase.from("projects").select("research_question, domain_framework, approach").eq("id", projectId!).single();

      const [codesRes, memosRes, appsRes] = await Promise.all([
        supabase.from("codes").select("id, label, definition, cycle").eq("project_id", projectId!),
        supabase.from("memos").select("title, content").eq("project_id", projectId!).eq("depth_score", "T"),
        supabase.from("code_applications").select("code_id"),
      ]);

      const codes = codesRes.data || [];
      const secondCycle = codes.filter((c: any) => c.cycle === "second");
      const appCounts: Record<string, number> = {};
      (appsRes.data || []).forEach((a: any) => { appCounts[a.code_id] = (appCounts[a.code_id] || 0) + 1; });

      const secondCycleText = secondCycle.map((c: any) => `${c.label} (Definition: ${c.definition || "none"}, Frequency: ${appCounts[c.id] || 0})`).join("\n");
      const memosText = (memosRes.data || []).map((m: any) => {
        const text = typeof m.content === "string" ? m.content : m.content?.text || "";
        return `MEMO: ${m.title}\n${text}`;
      }).join("\n\n");

      const { data, error } = await supabase.functions.invoke("ai-emerge-theory", {
        body: {
          research_question: project?.research_question,
          domain_framework: project?.domain_framework,
          approach: project?.approach,
          second_cycle_codes: secondCycleText,
          theoretical_memos: memosText,
          codebook_categories: secondCycleText,
        },
      });

      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }

      for (const prop of data?.propositions || []) {
        await supabase.from("theory_propositions").insert({
          project_id: projectId,
          statement: prop.statement,
          supporting_codes: prop.supporting_codes,
          theoretical_significance: prop.theoretical_significance,
          tensions: prop.tensions,
          confidence: prop.confidence,
          created_by: "claude",
        } as any);
      }

      toast.success(`${data?.propositions?.length || 0} propositions emerged`);
      loadData();
    } catch (err: any) {
      console.error("Theory emergence failed:", err);
      toast.error("Theory emergence failed");
    } finally {
      setEmerging(false);
    }
  };

  const challengeProposition = async (prop: Proposition) => {
    setChallengingId(prop.id);
    try {
      const { data: project } = await supabase.from("projects").select("research_question").eq("id", projectId!).single();

      const { data: apps } = await supabase.from("code_applications").select("segment_text, code_id, transcript_id");
      const { data: codes } = await supabase.from("codes").select("id, label").eq("project_id", projectId!);
      const { data: transcripts } = await supabase.from("transcripts").select("id, participant_pseudonym").eq("project_id", projectId!);

      const codeMap = Object.fromEntries((codes || []).map((c: any) => [c.id, c.label]));
      const transcriptMap = Object.fromEntries((transcripts || []).map((t: any) => [t.id, t.participant_pseudonym]));

      const segmentsText = (apps || []).map((a: any) =>
        `"${a.segment_text}" — Code: ${codeMap[a.code_id] || "?"}, Transcript: ${transcriptMap[a.transcript_id] || "?"}`
      ).join("\n");

      const { data, error } = await supabase.functions.invoke("ai-rival-challenge", {
        body: {
          proposition_statement: prop.statement,
          research_question: project?.research_question,
          all_coded_segments: segmentsText,
        },
      });

      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }

      await supabase.from("theory_propositions").update({
        rival_evidence: data.rival_evidence,
      } as any).eq("id", prop.id);

      toast.success(`Found ${data.rival_evidence?.length || 0} rival evidence items`);
      loadData();
    } catch (err: any) {
      console.error("Rival challenge failed:", err);
      toast.error("Rival challenge failed");
    } finally {
      setChallengingId(null);
    }
  };

  const acceptProposition = async (id: string) => {
    await supabase.from("theory_propositions").update({ status: "accepted" } as any).eq("id", id);
    toast.success("Proposition accepted");
    loadData();
  };

  const saveEdit = async (id: string) => {
    await supabase.from("theory_propositions").update({ statement: editText, status: "refined" } as any).eq("id", id);
    setEditingId(null);
    toast.success("Proposition refined");
    loadData();
  };

  const saveRivalResponse = async (propId: string, idx: number) => {
    const prop = propositions.find((p) => p.id === propId);
    if (!prop) return;
    const responses = prop.researcher_responses || {};
    responses[idx] = responseText;
    await supabase.from("theory_propositions").update({ researcher_responses: responses } as any).eq("id", propId);
    setRespondingKey(null);
    setResponseText("");
    toast.success("Response saved");
    loadData();
  };

  const toggleSection = (propId: string, section: string) => {
    setExpandedSection((prev) => {
      const current = prev[propId] || [];
      return {
        ...prev,
        [propId]: current.includes(section) ? current.filter((s) => s !== section) : [...current, section],
      };
    });
  };

  const isSectionOpen = (propId: string, section: string) => (expandedSection[propId] || []).includes(section);

  if (authLoading || loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-muted-foreground">Loading theory…</p></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[1200px] items-center gap-4 px-8 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}/transcripts`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="font-heading text-xl text-foreground">Theory Emergence</h1>
            <p className="text-xs text-muted-foreground">Propositions grounded in your data</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-8 py-10 space-y-8">
        {/* Readiness + trigger */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-heading text-lg text-foreground">Emerge Theory from Data</h2>
              {!isReady && (
                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className={theoreticalMemoCount >= 3 ? "text-success" : ""}>
                    Theoretical memos: {theoreticalMemoCount}/3
                  </span>
                  <span className={codedTranscriptCount >= 5 ? "text-success" : ""}>
                    Coded transcripts: {codedTranscriptCount}/5
                  </span>
                </div>
              )}
            </div>
            <Button onClick={emergeTheory} disabled={!isReady || emerging}>
              {emerging ? (
                <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Emerging…</>
              ) : (
                <><Sparkles className="mr-1.5 h-3.5 w-3.5" /> Emerge Theory from my data</>
              )}
            </Button>
          </div>
        </div>

        {/* Propositions */}
        {propositions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-16 text-center">
            <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">No propositions yet. Meet the readiness criteria and click "Emerge Theory".</p>
          </div>
        ) : (
          <div className="space-y-4">
            {propositions.map((prop) => {
              const isExpanded = expandedId === prop.id;
              const rivalEvidence: RivalItem[] = prop.rival_evidence || [];
              const responses: Record<number, string> = prop.researcher_responses || {};

              return (
                <div key={prop.id} className="rounded-lg border border-border bg-card overflow-hidden">
                  {/* Header */}
                  <div className="p-6">
                    <div className="flex items-start gap-3">
                      <button onClick={() => setExpandedId(isExpanded ? null : prop.id)} className="mt-1">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </button>
                      <div className="flex-1">
                        {editingId === prop.id ? (
                          <div className="space-y-2">
                            <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} className="text-base" />
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => saveEdit(prop.id)}>Save</Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <p className="font-heading text-lg text-foreground leading-relaxed">{prop.statement}</p>
                        )}
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          {prop.confidence && (
                            <Badge variant="outline" className={CONFIDENCE_BADGE[prop.confidence] || ""}>
                              {prop.confidence.toUpperCase()}
                            </Badge>
                          )}
                          <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
                            {prop.status.toUpperCase()}
                          </Badge>
                          {rivalEvidence.length > 0 && (
                            <Badge variant="outline" className="border-destructive/40 text-destructive">
                              {rivalEvidence.length} RIVAL
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border px-6 py-4 space-y-4">
                      {/* Collapsible sections */}
                      <button className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => toggleSection(prop.id, "codes")}>
                        {isSectionOpen(prop.id, "codes") ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <span className="font-mono uppercase tracking-wider">Supporting Codes</span>
                      </button>
                      {isSectionOpen(prop.id, "codes") && prop.supporting_codes && (
                        <div className="ml-5 flex flex-wrap gap-1.5">
                          {prop.supporting_codes.map((code, i) => (
                            <Badge key={i} variant="secondary">{code}</Badge>
                          ))}
                        </div>
                      )}

                      <button className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => toggleSection(prop.id, "significance")}>
                        {isSectionOpen(prop.id, "significance") ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <span className="font-mono uppercase tracking-wider">Theoretical Significance</span>
                      </button>
                      {isSectionOpen(prop.id, "significance") && (
                        <p className="ml-5 text-sm text-foreground">{prop.theoretical_significance}</p>
                      )}

                      <button className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => toggleSection(prop.id, "tensions")}>
                        {isSectionOpen(prop.id, "tensions") ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <span className="font-mono uppercase tracking-wider">Tensions</span>
                      </button>
                      {isSectionOpen(prop.id, "tensions") && (
                        <p className="ml-5 text-sm text-warning">{prop.tensions}</p>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 pt-2">
                        {prop.status === "proposed" && (
                          <Button size="sm" onClick={() => acceptProposition(prop.id)}>
                            <Check className="mr-1.5 h-3 w-3" /> Accept
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => challengeProposition(prop)} disabled={challengingId === prop.id} className="border-destructive/40 text-destructive hover:bg-destructive/10">
                          {challengingId === prop.id ? (
                            <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Finding rivals…</>
                          ) : (
                            <><Swords className="mr-1.5 h-3 w-3" /> Challenge it</>
                          )}
                        </Button>
                        {editingId !== prop.id && (
                          <Button size="sm" variant="ghost" onClick={() => { setEditingId(prop.id); setEditText(prop.statement); }}>
                            <PenLine className="mr-1.5 h-3 w-3" /> Edit
                          </Button>
                        )}
                      </div>

                      {/* Rival evidence */}
                      {rivalEvidence.length > 0 && (
                        <div className="space-y-2 pt-2">
                          <h4 className="font-mono text-[10px] uppercase tracking-wider text-destructive flex items-center gap-1.5">
                            <ShieldAlert className="h-3 w-3" /> Rival Evidence
                          </h4>
                          {rivalEvidence.map((rival, idx) => (
                            <div key={idx} className="space-y-2">
                              <div className="border-l-2 border-destructive pl-4 rounded-sm bg-destructive/5 p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <Badge variant="outline" className={CHALLENGE_BADGE[rival.challenge_type] || ""}>
                                    {rival.challenge_type?.replace("_", " ").toUpperCase()}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground font-mono">
                                    {rival.transcript_pseudonym} · {rival.code_label}
                                  </span>
                                </div>
                                <p className="text-sm italic text-foreground">"{rival.segment_text}"</p>
                                <p className="mt-1.5 text-xs text-muted-foreground">{rival.explanation}</p>
                              </div>

                              {/* Researcher response */}
                              {responses[idx] ? (
                                <div className="ml-4 rounded-sm border border-border bg-secondary/30 p-3">
                                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Your response</p>
                                  <p className="text-sm text-foreground">{responses[idx]}</p>
                                </div>
                              ) : (
                                respondingKey === `${prop.id}-${idx}` ? (
                                  <div className="ml-4 space-y-2">
                                    <Input
                                      value={responseText}
                                      onChange={(e) => setResponseText(e.target.value)}
                                      placeholder="How does your proposition account for this?"
                                      onKeyDown={(e) => e.key === "Enter" && saveRivalResponse(prop.id, idx)}
                                    />
                                    <div className="flex gap-2">
                                      <Button size="sm" onClick={() => saveRivalResponse(prop.id, idx)}>Save</Button>
                                      <Button size="sm" variant="ghost" onClick={() => setRespondingKey(null)}>Cancel</Button>
                                    </div>
                                  </div>
                                ) : (
                                  <Button size="sm" variant="ghost" className="ml-4 text-xs" onClick={() => { setRespondingKey(`${prop.id}-${idx}`); setResponseText(""); }}>
                                    Respond to this evidence
                                  </Button>
                                )
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default Theory;
