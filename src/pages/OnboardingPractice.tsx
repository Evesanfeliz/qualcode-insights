import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Sparkles, X, ArrowRight } from "lucide-react";
import { PRACTICE_TRANSCRIPT } from "@/lib/onboarding-data";
import { useOnboarding } from "@/hooks/useOnboarding";

type PracticeCode = { id: string; label: string };
type PracticeApp = { id: string; code_id: string; segment_text: string; start_index: number; end_index: number };

const GUIDED_STEPS = [
  { target: "transcript", title: "This is your transcript", body: "This is what Marco said in his interview. Read it carefully. Your job is to find passages that seem meaningful and give them a label. Start by reading the whole thing once.", action: "button", buttonLabel: "Ready to start coding →" },
  { target: "paragraph-1", title: "Select a passage to code", body: 'Click and drag to select this text: "by the time I sit down, half my morning admin is already handled" When you release, a small panel will appear.', action: "select" },
  { target: "popover", title: "Name your code", body: 'This is where you give the passage a label. A good code is short (2–5 words) and captures the meaning, not just the topic. Try typing: routine task automation. Then click Apply.', action: "apply" },
  { target: "highlight", title: "Your first code", body: 'See how that passage is now highlighted? The code also appears in the right panel with a count of 1. Now try coding another passage on your own. Look at: "The thinking is still mine. The judgment is still mine."', action: "apply-another" },
  { target: "ask-ai", title: "Ask the AI for a suggestion", body: 'Select this passage: "I have nowhere to hide … The AI removed my excuses." Then click \'Ask AI\' instead of typing a code yourself. The AI will suggest codes based on your research domain.', action: "ask-ai" },
  { target: "ai-cards", title: "Review the suggestions", body: "The AI has suggested three codes. Read each one carefully. Click the one that resonates most — or close this and type your own. The AI suggests. You decide.", action: "accept-suggestion" },
  { target: "memos", title: "Write a memo about what you noticed", body: 'In the real app, you would click Memos in the sidebar. A memo is a note to yourself about what you are seeing in the data. Not a summary — an analytical observation.', action: "button", buttonLabel: "I understand memos →" },
  { target: "depth-score", title: "Your memo would be scored", body: "See the badge next to a memo? D means Descriptive, I means Interpretive, T means Theoretical. Aim for T — that is where theory comes from.", action: "button", buttonLabel: "I'm ready — show me the platform →" },
];

const OnboardingPractice = () => {
  const navigate = useNavigate();
  const { updateProgress } = useOnboarding();
  const contentRef = useRef<HTMLDivElement>(null);
  const [guidedStep, setGuidedStep] = useState(0);
  const [codes, setCodes] = useState<PracticeCode[]>([]);
  const [applications, setApplications] = useState<PracticeApp[]>([]);
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [newCodeLabel, setNewCodeLabel] = useState("");
  const [showAiSuggestions, setShowAiSuggestions] = useState(false);

  const transcript = PRACTICE_TRANSCRIPT;
  const text = transcript.content;
  const lines = text.split("\n");

  const aiSuggestions = [
    { label: "routine task automation", justification: "Captures delegation of repetitive work to AI" },
    { label: "accountability exposure", justification: "AI removes ability to hide behind busywork" },
    { label: "cognitive load offloading", justification: "Transferring mental burden to automated systems" },
  ];

  const renderedContent = useMemo(() => {
    if (applications.length === 0) return text;
    const sorted = [...applications].sort((a, b) => a.start_index - b.start_index);
    const parts: React.ReactNode[] = [];
    let cursor = 0;
    sorted.forEach((app) => {
      if (app.start_index > cursor) parts.push(text.slice(cursor, app.start_index));
      const codeLabel = codes.find((c) => c.id === app.code_id)?.label || "?";
      parts.push(
        <mark
          key={app.id}
          style={{ backgroundColor: "rgba(14, 158, 138, 0.18)", borderLeft: "2px solid hsl(172, 83%, 33%)", paddingLeft: "4px" }}
          title={codeLabel}
        >
          {text.slice(app.start_index, app.end_index)}
        </mark>
      );
      cursor = app.end_index;
    });
    if (cursor < text.length) parts.push(text.slice(cursor));
    return parts;
  }, [text, applications, codes]);

  const handleMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !contentRef.current) return;
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
    setShowAiSuggestions(false);

    // Advance from step 1 (select) to step 2 (popover)
    if (guidedStep === 1) setGuidedStep(2);
  };

  const applyCode = (label: string) => {
    if (!selection || !label.trim()) return;
    let code = codes.find((c) => c.label === label.trim());
    if (!code) {
      code = { id: crypto.randomUUID(), label: label.trim() };
      setCodes((prev) => [...prev, code!]);
    }
    const app: PracticeApp = {
      id: crypto.randomUUID(),
      code_id: code.id,
      segment_text: selection.text,
      start_index: selection.start,
      end_index: selection.end,
    };
    setApplications((prev) => [...prev, app]);
    setPopoverOpen(false);
    setSelection(null);
    window.getSelection()?.removeAllRanges();

    // Advance steps
    if (guidedStep === 2) setGuidedStep(3);
    else if (guidedStep === 3) setGuidedStep(4);
    else if (guidedStep === 5) setGuidedStep(6);
  };

  const handleAskAI = () => {
    setShowAiSuggestions(true);
    if (guidedStep === 4) setGuidedStep(5);
  };

  const handleFinish = async () => {
    await updateProgress({ practice_completed: true });
    navigate("/dashboard?tour=true");
  };

  const handleSkip = async () => {
    await updateProgress({ practice_completed: true });
    navigate("/dashboard?tour=true");
  };

  const step = GUIDED_STEPS[guidedStep];
  const showOverlay = guidedStep < GUIDED_STEPS.length;

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

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={60} minSize={40}>
          <ScrollArea className="h-full">
            <div className="flex" style={{ backgroundColor: "hsl(var(--transcript-bg))" }}>
              <div className="shrink-0 select-none border-r px-3 py-6 text-right" style={{ borderColor: "hsl(var(--transcript-line))" }}>
                {lines.map((_, i) => (
                  <div key={i} className="font-mono text-[11px] leading-7 text-muted-foreground/40">{i + 1}</div>
                ))}
              </div>
              <div className="flex-1 p-6">
                <div
                  ref={contentRef}
                  className="whitespace-pre-wrap font-mono text-[13px] leading-7 selection:bg-primary/25"
                  style={{ color: "hsl(var(--transcript-fg))" }}
                  onMouseUp={handleMouseUp}
                >
                  {renderedContent}
                </div>
              </div>
            </div>

            {/* Floating code popover */}
            {popoverOpen && (
              <div className="fixed z-50" style={{ left: Math.max(10, popoverPos.x - 160), top: Math.max(10, popoverPos.y - (showAiSuggestions ? 400 : 200)) }}>
                <div className="w-[320px] rounded-md border border-primary/50 bg-popover p-4 shadow-lg shadow-black/30">
                  <p className="mb-3 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Apply code to selection</p>
                  <div className="space-y-3">
                    <Input placeholder="New code name..." value={newCodeLabel} onChange={(e) => setNewCodeLabel(e.target.value)} className="h-8 text-sm" />
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" className="flex-1" onClick={() => { setPopoverOpen(false); setSelection(null); window.getSelection()?.removeAllRanges(); }}>Cancel</Button>
                      <Button size="sm" variant="outline" className="gap-1" onClick={handleAskAI}>
                        <Sparkles className="h-3.5 w-3.5" /> Ask AI
                      </Button>
                      <Button size="sm" className="flex-1" onClick={() => applyCode(newCodeLabel)}>Apply</Button>
                    </div>
                  </div>
                  {showAiSuggestions && (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">AI Suggestions</p>
                      {aiSuggestions.map((s, i) => (
                        <button
                          key={i}
                          className="w-full rounded-sm border border-border bg-secondary/50 p-2.5 text-left transition-colors hover:bg-secondary"
                          onClick={() => applyCode(s.label)}
                        >
                          <span className="text-sm font-medium text-foreground">{s.label}</span>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.justification}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
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
                  <p className="text-sm text-muted-foreground py-8 text-center">No codes yet. Select text to create your first code.</p>
                ) : codes.map((code) => (
                  <div key={code.id} className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm">
                    <div className="h-2.5 w-2.5 rounded-full shrink-0 bg-primary" />
                    <span className="flex-1 truncate text-foreground font-body">{code.label}</span>
                    <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{codeFrequency[code.id] || 0}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Guided step overlay */}
      {showOverlay && (
        <div className="fixed inset-0 z-[100] pointer-events-none">
          {/* Dimming layer */}
          <div className="absolute inset-0 bg-black/50 pointer-events-auto" />
          {/* Tooltip */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-auto">
            <div className="w-[420px] rounded-lg border-2 border-primary bg-card p-6 shadow-2xl shadow-black/40">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-body text-[15px] font-bold text-foreground">{step.title}</h3>
                <span className="font-mono text-[10px] text-muted-foreground">Step {guidedStep + 1} of {GUIDED_STEPS.length}</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">{step.body}</p>
              <div className="flex items-center justify-between">
                {step.action === "button" ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      if (guidedStep === GUIDED_STEPS.length - 1) handleFinish();
                      else setGuidedStep(guidedStep + 1);
                    }}
                  >
                    {step.buttonLabel || "Continue"} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setGuidedStep(guidedStep + 1)}>
                    Got it — I'll try it
                  </Button>
                )}
                <button onClick={handleSkip} className="text-xs text-muted-foreground hover:text-foreground">
                  Skip practice →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnboardingPractice;
