import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Sparkles, Copy, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

type Bridge = {
  id: string;
  researcher_element: string;
  literature_concept: string;
  paper_id: string | null;
  relationship_type: string;
  explanation: string | null;
  implication: string | null;
};

type Paper = {
  id: string;
  title: string;
  key_concepts: any;
  main_argument: string | null;
};

type LiteratureBridgeTabProps = {
  projectId: string;
};

const REL_COLORS: Record<string, { border: string; badge: string; line: string }> = {
  extends: { border: "border-primary", badge: "border-primary/40 text-primary", line: "bg-primary" },
  challenges: { border: "border-destructive", badge: "border-destructive/40 text-destructive", line: "bg-destructive" },
  fills_gap: { border: "border-warning", badge: "border-warning/40 text-warning", line: "bg-warning" },
  replicates: { border: "border-muted-foreground", badge: "border-muted-foreground/40 text-muted-foreground", line: "bg-muted-foreground" },
};

const REL_STYLE: Record<string, string> = {
  extends: "solid",
  challenges: "dashed",
  fills_gap: "dotted",
  replicates: "solid",
};

export const LiteratureBridgeTab = ({ projectId }: LiteratureBridgeTabProps) => {
  const [bridges, setBridges] = useState<Bridge[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // Readiness
  const [hasExtractedPaper, setHasExtractedPaper] = useState(false);
  const [secondCycleCount, setSecondCycleCount] = useState(0);
  const isReady = hasExtractedPaper && secondCycleCount >= 3;

  const loadData = useCallback(async () => {
    const [bridgesRes, papersRes, codesRes] = await Promise.all([
      supabase.from("literature_bridges").select("*").eq("project_id", projectId).order("created_at"),
      supabase.from("literature_papers").select("id, title, key_concepts, main_argument").eq("project_id", projectId),
      supabase.from("codes").select("id, cycle").eq("project_id", projectId).eq("cycle", "second"),
    ]);
    if (bridgesRes.data) setBridges(bridgesRes.data as Bridge[]);
    if (papersRes.data) {
      setPapers(papersRes.data as Paper[]);
      setHasExtractedPaper(papersRes.data.some((p: any) => p.key_concepts && p.key_concepts.length > 0));
    }
    setSecondCycleCount(codesRes.data?.length || 0);
    setInitialLoad(false);
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  const buildBridge = async () => {
    setLoading(true);
    try {
      const [projectRes, papersRes, codesRes, appsRes] = await Promise.all([
        supabase.from("projects").select("research_question, domain_framework, literature_review_text").eq("id", projectId).single(),
        supabase.from("literature_papers").select("*").eq("project_id", projectId),
        supabase.from("codes").select("id, label, definition, cycle, example_quote").eq("project_id", projectId).eq("cycle", "second"),
        supabase.from("code_applications").select("code_id, segment_text"),
      ]);

      const project = projectRes.data as any;
      const allPapers = papersRes.data || [];
      const codes = codesRes.data || [];

      const papersText = allPapers.map((p: any) => {
        const concepts = (p.key_concepts || []).map((kc: any) => `  - ${kc.name}: ${kc.definition}`).join("\n");
        return `PAPER: ${p.title}\nMain argument: ${p.main_argument || "N/A"}\nKey concepts:\n${concepts}`;
      }).join("\n\n");

      const codeSegments: Record<string, string[]> = {};
      (appsRes.data || []).forEach((a: any) => {
        if (!codeSegments[a.code_id]) codeSegments[a.code_id] = [];
        if (codeSegments[a.code_id].length < 3) codeSegments[a.code_id].push(a.segment_text);
      });

      const codesText = codes.map((c: any) => {
        const segs = (codeSegments[c.id] || []).map((s: string) => `    "${s}"`).join("\n");
        return `CODE: ${c.label}\nDefinition: ${c.definition || "N/A"}\nExample segments:\n${segs}`;
      }).join("\n\n");

      const { data, error } = await supabase.functions.invoke("ai-literature-bridge", {
        body: {
          research_question: project?.research_question,
          domain_framework: project?.domain_framework,
          literature_review_text: project?.literature_review_text,
          papers: papersText,
          second_cycle_codes: codesText,
        },
      });

      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }

      // Delete old bridges and insert new
      await supabase.from("literature_bridges").delete().eq("project_id", projectId);

      for (const bridge of data?.bridges || []) {
        const matchingPaper = allPapers.find((p: any) => p.title === bridge.paper_title);
        await supabase.from("literature_bridges").insert({
          project_id: projectId,
          researcher_element: bridge.researcher_element,
          literature_concept: bridge.literature_concept,
          paper_id: matchingPaper?.id || null,
          relationship_type: bridge.relationship_type,
          explanation: bridge.explanation,
          implication: bridge.implication,
        } as any);
      }

      toast.success(`${data?.bridges?.length || 0} bridges built`);
      loadData();
    } catch (err: any) {
      console.error("Literature bridge failed:", err);
      toast.error("Bridge building failed");
    } finally {
      setLoading(false);
    }
  };

  const copyBridgeSummary = () => {
    const summary = bridges.map((b) => {
      const paper = papers.find((p) => p.id === b.paper_id);
      return `${b.researcher_element} → ${b.literature_concept} (${paper?.title || "Unknown paper"})
Relationship: ${b.relationship_type?.replace("_", " ")}
${b.explanation || ""}
Implication: ${b.implication || ""}`;
    }).join("\n\n---\n\n");

    navigator.clipboard.writeText(summary);
    toast.success("Bridge summary copied to clipboard");
  };

  if (initialLoad) return <p className="text-muted-foreground text-sm p-6">Loading…</p>;

  // Get unique researcher elements and literature concepts
  const researcherElements = [...new Set(bridges.map((b) => b.researcher_element))];
  const litConcepts = [...new Set(bridges.map((b) => `${b.literature_concept}||${b.paper_id}`))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-lg text-foreground">Literature Bridge</h2>
          <p className="text-xs text-muted-foreground">
            Connect your empirical codes to theoretical concepts
          </p>
          {!isReady && (
            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              <span className={hasExtractedPaper ? "text-success" : ""}>
                Papers with concepts: {hasExtractedPaper ? "✓" : "0"}/1
              </span>
              <span className={secondCycleCount >= 3 ? "text-success" : ""}>
                Second-cycle codes: {secondCycleCount}/3
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {bridges.length > 0 && (
            <Button size="sm" variant="outline" onClick={copyBridgeSummary}>
              <Copy className="mr-1.5 h-3 w-3" /> Copy for thesis
            </Button>
          )}
          <Button onClick={buildBridge} disabled={!isReady || loading}>
            {loading ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Building…</>
            ) : (
              <><Sparkles className="mr-1.5 h-3.5 w-3.5" /> Build Literature Bridge</>
            )}
          </Button>
        </div>
      </div>

      {bridges.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-12 text-center">
          <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">No bridges yet. Meet the criteria and click "Build Literature Bridge".</p>
        </div>
      ) : (
        <>
          {/* Visual bridge display */}
          <div className="rounded-lg border border-border bg-card p-6">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-start">
              {/* Left: Researcher elements */}
              <div className="space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-wider text-primary mb-3">Your Codes</p>
                {researcherElements.map((elem) => (
                  <div key={elem} className="rounded-sm border border-primary/30 bg-primary/5 px-3 py-2">
                    <span className="text-sm font-medium text-primary">{elem}</span>
                  </div>
                ))}
              </div>

              {/* Center: Connection lines */}
              <div className="flex flex-col items-center justify-center gap-1 pt-8">
                {bridges.map((b, idx) => {
                  const colors = REL_COLORS[b.relationship_type] || REL_COLORS.replicates;
                  const style = REL_STYLE[b.relationship_type] || "solid";
                  return (
                    <button
                      key={idx}
                      className="flex items-center gap-1 px-2 py-0.5 hover:bg-secondary/50 rounded-sm transition-colors"
                      onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                    >
                      <div
                        className={`h-[2px] w-8 ${colors.line}`}
                        style={{ borderBottom: style === "dashed" ? "2px dashed" : style === "dotted" ? "2px dotted" : undefined }}
                      />
                      <Badge variant="outline" className={`text-[9px] px-1 py-0 ${colors.badge}`}>
                        {b.relationship_type?.replace("_", " ").toUpperCase()}
                      </Badge>
                      <div
                        className={`h-[2px] w-8 ${colors.line}`}
                        style={{ borderBottom: style === "dashed" ? "2px dashed" : style === "dotted" ? "2px dotted" : undefined }}
                      />
                    </button>
                  );
                })}
              </div>

              {/* Right: Literature concepts */}
              <div className="space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-wider text-accent mb-3">Literature Concepts</p>
                {litConcepts.map((key) => {
                  const [concept, paperId] = key.split("||");
                  const paper = papers.find((p) => p.id === paperId);
                  return (
                    <div key={key} className="rounded-sm border border-accent/30 bg-accent/5 px-3 py-2">
                      <span className="text-sm font-medium text-accent">{concept}</span>
                      {paper && <p className="text-[10px] text-muted-foreground mt-0.5">{paper.title}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Expanded connection details */}
          {expandedIdx !== null && bridges[expandedIdx] && (
            <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-primary/40 text-primary">{bridges[expandedIdx].researcher_element}</Badge>
                <span className="text-xs text-muted-foreground">→</span>
                <Badge variant="outline" className="border-accent/40 text-accent">{bridges[expandedIdx].literature_concept}</Badge>
              </div>
              <p className="text-sm text-foreground">{bridges[expandedIdx].explanation}</p>
              {bridges[expandedIdx].implication && (
                <p className="text-sm text-muted-foreground italic">
                  Implication: {bridges[expandedIdx].implication}
                </p>
              )}
            </div>
          )}

          {/* List view */}
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2">
              {bridges.map((b, idx) => {
                const paper = papers.find((p) => p.id === b.paper_id);
                const colors = REL_COLORS[b.relationship_type] || REL_COLORS.replicates;
                const isOpen = expandedIdx === idx;

                return (
                  <button
                    key={b.id}
                    className={`flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left transition-colors ${isOpen ? "bg-secondary" : "hover:bg-secondary/50"}`}
                    onClick={() => setExpandedIdx(isOpen ? null : idx)}
                  >
                    {isOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                    <span className="text-sm text-primary font-medium">{b.researcher_element}</span>
                    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${colors.badge}`}>
                      {b.relationship_type?.replace("_", " ")}
                    </Badge>
                    <span className="text-sm text-accent">{b.literature_concept}</span>
                    {paper && <span className="ml-auto text-[10px] text-muted-foreground">{paper.title}</span>}
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
};
