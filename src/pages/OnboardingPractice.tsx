import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Sparkles, ArrowRight, Play } from "lucide-react";
import { PRACTICE_TRANSCRIPT } from "@/lib/onboarding-data";
import { useOnboarding } from "@/hooks/useOnboarding";

type PracticeCode = { id: string; label: string };
type PracticeApp = { id: string; code_id: string; segment_text: string; start_index: number; end_index: number };

// Exact segments to highlight and auto-code in the demo
const DEMO_SEGMENTS = [
  {
    text: "by the time I sit down, half my morning admin is already handled",
    codeLabel: "routine task automation",
    stepTitle: "Selecting a passage",
    stepBody: "Watch — we are selecting a meaningful passage from the transcript. This is something Marco said about how AI changed his daily routine. The platform highlights the text and prepares to assign a code to it.",
  },
  {
    text: "is this still my work?",
    codeLabel: "ownership uncertainty",
    stepTitle: "Coding a second passage",
    stepBody: "This short phrase reveals something deeper — Marco questions whether AI-assisted work is truly 'his'. A good code captures that meaning: ownership uncertainty.",
  },
  {
    text: "The thinking is still mine. The judgment is still mine. But the execution — a lot of that is automated now",
    codeLabel: "cognitive vs manual labor split",
    stepTitle: "Capturing a distinction",
    stepBody: "Marco draws a clear line between thinking and execution. This is the kind of passage that becomes theoretically significant later. Notice how the code name captures the distinction, not just the topic.",
  },
  {
    text: "I have nowhere to hide",
    codeLabel: "accountability exposure",
    stepTitle: "AI suggesting a code",
    stepBody: "For this passage, the AI suggests codes instead of you typing one. It offers three options based on your research domain. You always decide which fits best — or type your own. Here the AI suggested: accountability exposure.",
    isAiSuggested: true,
  },
  {
    text: "It's pushed me to figure out what my actual value is. Which is uncomfortable but probably necessary",
    codeLabel: "forced professional identity renegotiation",
    stepTitle: "A theoretical code",
    stepBody: "This is a rich passage. The code 'forced professional identity renegotiation' goes beyond describing what Marco said — it interprets what is happening. This is the kind of code that builds toward theory.",
  },
];

const DEMO_STEPS = [
  {
    title: "This is your transcript",
    body: "This is what Marco said in his interview. In qualitative research, your job is to read carefully and identify passages that seem meaningful — then give each one a short label called a code. Let's walk through it together.",
    action: "intro",
  },
  ...DEMO_SEGMENTS.map((seg, i) => ({
    title: seg.stepTitle,
    body: seg.stepBody,
    action: "demo-code" as const,
    segmentIndex: i,
  })),
  {
    title: "Your codes so far",
    body: "Look at the right panel — you now have 5 codes applied to 5 passages. Each code captures a different aspect of Marco's experience. Notice how they range from descriptive ('routine task automation') to interpretive ('forced professional identity renegotiation'). In the real app, you would continue coding the entire transcript.",
    action: "review",
  },
  {
    title: "Writing a memo",
    body: "After coding a transcript, you write a memo — a note to yourself about what you noticed. Not a summary, but an analytical observation. For example: 'Marco's comment about having nowhere to hide suggests AI doesn't just change what solopreneurs do — it changes what they can avoid. This reframes AI adoption as an accountability mechanism, not just an efficiency tool.'",
    action: "memo",
  },
  {
    title: "Memo depth scoring",
    body: "The AI scores every memo you write. D means Descriptive (a summary), I means Interpretive (you explain meaning), T means Theoretical (you connect to broader concepts). Aim for T — that is where theory comes from. The memo we just described would score T because it proposes a reframing.",
    action: "depth",
  },
  {
    title: "You are ready",
    body: "That is the core workflow: read → code → memo → repeat. Over time, your codes group into categories, categories become themes, and themes become theoretical propositions. The platform guides you through every step. Let's now take a quick tour of each screen.",
    action: "finish",
  },
];

const OnboardingPractice = () => {
  const navigate = useNavigate();
  const { updateProgress } = useOnboarding();
  const contentRef = useRef<HTMLDivElement>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [codes, setCodes] = useState<PracticeCode[]>([]);
  const [applications, setApplications] = useState<PracticeApp[]>([]);
  const [animatingSegment, setAnimatingSegment] = useState<number | null>(null);
  const [showAiBadge, setShowAiBadge] = useState(false);
  const [showMemo, setShowMemo] = useState(false);
  const [showDepthBadge, setShowDepthBadge] = useState(false);

  const transcript = PRACTICE_TRANSCRIPT;
  const text = transcript.content;
  const lines = text.split("\n");

  const step = DEMO_STEPS[currentStep];
  const progressValue = ((currentStep + 1) / DEMO_STEPS.length) * 100;

  // Find segment position in transcript text
  const findSegmentPosition = useCallback((segText: string) => {
    const start = text.indexOf(segText);
    if (start === -1) return null;
    return { start, end: start + segText.length };
  }, [text]);

  // Auto-apply a code when stepping through demo segments
  const applyDemoCode = useCallback((segIndex: number) => {
    const seg = DEMO_SEGMENTS[segIndex];
    const pos = findSegmentPosition(seg.text);
    if (!pos) return;

    setAnimatingSegment(segIndex);

    // After a brief animation delay, apply the code
    setTimeout(() => {
      let code = codes.find((c) => c.label === seg.codeLabel);
      if (!code) {
        code = { id: crypto.randomUUID(), label: seg.codeLabel };
        setCodes((prev) => [...prev, code!]);
      }
      if (seg.isAiSuggested) setShowAiBadge(true);
      setApplications((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          code_id: code!.id,
          segment_text: seg.text,
          start_index: pos.start,
          end_index: pos.end,
        },
      ]);
      setAnimatingSegment(null);
    }, 1200);
  }, [codes, findSegmentPosition]);

  // When step changes, auto-trigger demo actions
  useEffect(() => {
    if (step?.action === "demo-code" && "segmentIndex" in step) {
      applyDemoCode(step.segmentIndex as number);
    }
    if (step?.action === "memo") setShowMemo(true);
    if (step?.action === "depth") setShowDepthBadge(true);
    if (step?.action === "review") setShowAiBadge(false);
  }, [currentStep]);

  useEffect(() => {
    if (animatingSegment === null) return;

    const timeout = window.setTimeout(() => {
      const activeHighlight = contentRef.current?.querySelector("[data-active-highlight='true']");
      activeHighlight?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);

    return () => window.clearTimeout(timeout);
  }, [animatingSegment]);

  const handleNext = async () => {
    if (currentStep < DEMO_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      await updateProgress({ practice_completed: true });
      navigate("/dashboard?tour=true");
    }
  };

  const handleSkip = async () => {
    await updateProgress({ practice_completed: true });
    navigate("/dashboard?tour=true");
  };

  // Rendered transcript with highlights
  const renderedContent = useMemo(() => {
    const allApps = [...applications];
    // Add animating segment as a pulsing highlight
    if (animatingSegment !== null) {
      const seg = DEMO_SEGMENTS[animatingSegment];
      const pos = findSegmentPosition(seg.text);
      if (pos) {
        // Don't add to applications yet, just show the selection highlight
      }
    }

    if (allApps.length === 0 && animatingSegment === null) {
      return text;
    }

    // Build rendered content with applied codes + optional animating segment
    const highlights: { start: number; end: number; label: string; isAnimating: boolean }[] = [];
    
    allApps.forEach((app) => {
      const codeLabel = codes.find((c) => c.id === app.code_id)?.label || "?";
      highlights.push({ start: app.start_index, end: app.end_index, label: codeLabel, isAnimating: false });
    });

    if (animatingSegment !== null) {
      const seg = DEMO_SEGMENTS[animatingSegment];
      const pos = findSegmentPosition(seg.text);
      if (pos && !highlights.some((h) => h.start === pos.start)) {
        highlights.push({ start: pos.start, end: pos.end, label: seg.codeLabel, isAnimating: true });
      }
    }

    highlights.sort((a, b) => a.start - b.start);

    const parts: React.ReactNode[] = [];
    let cursor = 0;
    highlights.forEach((h, i) => {
      if (h.start > cursor) parts.push(text.slice(cursor, h.start));
      parts.push(
        <mark
          key={i}
          className={`rounded-sm pl-1 border-l-2 ${
            h.isAnimating
              ? "bg-primary/30 border-primary animate-pulse"
              : "bg-primary/15 border-primary/60"
          }`}
          title={h.label}
        >
          {text.slice(h.start, h.end)}
        </mark>
      );
      cursor = h.end;
    });
    if (cursor < text.length) parts.push(text.slice(cursor));
    return parts;
  }, [text, applications, codes, animatingSegment, findSegmentPosition]);

  const codeFrequency = useMemo(() => {
    const freq: Record<string, number> = {};
    applications.forEach((a) => { freq[a.code_id] = (freq[a.code_id] || 0) + 1; });
    return freq;
  }, [applications]);

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Practice banner */}
      <div className="shrink-0 bg-warning/10 border-b border-warning/30 px-5 py-2 flex items-center justify-between">
        <span className="text-warning text-sm font-medium">Practice mode — nothing here is saved</span>
        <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground text-xs">
          Skip practice →
        </Button>
      </div>

      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card px-5 py-3">
        <div className="flex items-center gap-3">
          <h1 className="font-body text-sm font-semibold text-foreground tracking-wide">Coding Workspace</h1>
          <span className="text-muted-foreground">·</span>
          <span className="text-sm text-muted-foreground">{transcript.participant_pseudonym}</span>
        </div>
      </header>

      <div className="flex-1 flex relative overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          <ResizablePanel defaultSize={60} minSize={40}>
            <ScrollArea className="h-full">
              <div className="flex" style={{ backgroundColor: "hsl(var(--transcript-bg, 220 18% 10%))" }}>
                <div className="shrink-0 select-none border-r px-3 py-6 text-right" style={{ borderColor: "hsl(var(--transcript-line, 220 13% 18%))" }}>
                  {lines.map((_, i) => (
                    <div key={i} className="font-mono text-[11px] leading-7 text-muted-foreground/40">{i + 1}</div>
                  ))}
                </div>
                <div className="flex-1 p-6">
                  <div
                    ref={contentRef}
                    className="whitespace-pre-wrap font-mono text-[13px] leading-7"
                    style={{ color: "hsl(var(--transcript-fg, 210 20% 80%))" }}
                  >
                    {renderedContent}
                  </div>
                </div>
              </div>
            </ScrollArea>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={40} minSize={25}>
            <div className="flex h-full flex-col border-l border-border bg-card">
              <div className="border-b border-border px-6 py-4">
                <h2 className="font-body text-sm font-semibold text-foreground">Codes</h2>
                <p className="font-mono text-[10px] text-muted-foreground mt-0.5">{codes.length} codes · {applications.length} applications</p>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-0.5">
                  {codes.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">Codes will appear here as the demo proceeds.</p>
                  ) : codes.map((code) => (
                    <div key={code.id} className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm animate-fade-in">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0 bg-primary" />
                      <span className="flex-1 truncate text-foreground font-body">{code.label}</span>
                      <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{codeFrequency[code.id] || 0}</span>
                      {showAiBadge && code.label === "accountability exposure" && (
                        <Badge variant="outline" className="text-[9px] border-primary/40 text-primary gap-1">
                          <Sparkles className="h-2.5 w-2.5" /> AI
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>

                {/* Simulated memo section */}
                {showMemo && (
                  <div className="mx-3 mt-4 rounded-lg border border-border bg-secondary/30 p-4 animate-fade-in">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Sample memo</p>
                    <p className="text-sm text-foreground leading-relaxed italic">
                      "Marco's comment about having 'nowhere to hide' suggests AI doesn't just change what solopreneurs do — it changes what they can avoid. This reframes AI adoption as an accountability mechanism, not just an efficiency tool."
                    </p>
                    {showDepthBadge && (
                      <div className="mt-3 flex items-center gap-2 animate-scale-in">
                        <Badge className="bg-primary/20 text-primary border-primary/30 font-mono text-[11px]">T</Badge>
                        <span className="text-xs text-muted-foreground">Theoretical depth</span>
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>

        {/* Step-by-step explanation panel — fixed at bottom */}
        <div className="absolute bottom-0 left-0 right-0 z-50">
          <div className="mx-auto max-w-[600px] p-4">
            <div className="rounded-lg border-2 border-primary bg-card p-5 shadow-2xl shadow-black/50">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-body text-[15px] font-bold text-foreground">{step.title}</h3>
                <span className="font-mono text-[10px] text-muted-foreground shrink-0 ml-3">
                  {currentStep + 1} / {DEMO_STEPS.length}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">{step.body}</p>
              <div className="flex items-center justify-between">
                <Button
                  size="sm"
                  onClick={handleNext}
                  disabled={animatingSegment !== null}
                  className="gap-1.5"
                >
                  {currentStep === DEMO_STEPS.length - 1 ? (
                    <>Show me the platform <ArrowRight className="h-3.5 w-3.5" /></>
                  ) : animatingSegment !== null ? (
                    <>Applying code…</>
                  ) : (
                    <>Next <Play className="h-3 w-3" /></>
                  )}
                </Button>
                <button onClick={handleSkip} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Skip practice →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingPractice;
