import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Map, Code2, BookOpen } from "lucide-react";

export function HelpModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const [refOpen, setRefOpen] = useState(false);

  const handleReplayTour = () => {
    onOpenChange(false);
    setTimeout(() => {
      (window as any).__startAppTour?.();
    }, 300);
  };

  const handlePractice = () => {
    onOpenChange(false);
    navigate("/onboarding/practice");
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Help & Guide</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            <button
              onClick={handleReplayTour}
              className="w-full flex items-center gap-4 rounded-lg border border-border bg-secondary/30 px-4 py-4 text-left transition-colors hover:bg-secondary"
            >
              <Map className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Replay the platform tour</p>
                <p className="text-xs text-muted-foreground mt-0.5">Walk through every feature step by step</p>
              </div>
            </button>
            <button
              onClick={handlePractice}
              className="w-full flex items-center gap-4 rounded-lg border border-border bg-secondary/30 px-4 py-4 text-left transition-colors hover:bg-secondary"
            >
              <Code2 className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Practice coding again</p>
                <p className="text-xs text-muted-foreground mt-0.5">Fresh transcript, nothing saved</p>
              </div>
            </button>
            <button
              onClick={() => { onOpenChange(false); setRefOpen(true); }}
              className="w-full flex items-center gap-4 rounded-lg border border-border bg-secondary/30 px-4 py-4 text-left transition-colors hover:bg-secondary"
            >
              <BookOpen className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Methodology reference</p>
                <p className="text-xs text-muted-foreground mt-0.5">Coding tips, memo scoring, and more</p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={refOpen} onOpenChange={setRefOpen}>
        <SheetContent side="right" className="w-[400px] sm:w-[400px] p-0">
          <SheetHeader className="px-6 py-4 border-b border-border">
            <SheetTitle className="font-heading text-lg">Methodology Reference</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-65px)]">
            <div className="px-6 py-6 space-y-8">
              <Section title="What makes a good code?">
                <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed">
                  <li>• <strong className="text-foreground">Short:</strong> 2-5 words. Not a sentence.</li>
                  <li>• <strong className="text-foreground">Close to the data:</strong> use the participant's own language where possible.</li>
                  <li>• <strong className="text-foreground">Active:</strong> use gerunds where you can (e.g. 'delegating decisions' not 'decision delegation').</li>
                  <li>• <strong className="text-foreground">Not a topic:</strong> a code captures what is happening, not just what it is about.</li>
                  <li>• Example — <span className="text-destructive">Weak: 'AI use'</span>. <span className="text-primary">Strong: 'outsourcing cognitive load'</span>.</li>
                </ul>
              </Section>

              <Section title="What makes a good memo?">
                <div className="space-y-3 text-sm">
                  <div className="rounded-md border border-border bg-secondary/30 p-3">
                    <Badge variant="outline" className="mb-1.5 text-muted-foreground border-muted-foreground/30">D — Descriptive</Badge>
                    <p className="text-muted-foreground italic">'Participants mentioned using AI for routine tasks.'</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">This is a summary. Not a memo.</p>
                  </div>
                  <div className="rounded-md border border-border bg-secondary/30 p-3">
                    <Badge variant="outline" className="mb-1.5 text-warning border-warning/30">I — Interpretive</Badge>
                    <p className="text-muted-foreground italic">'Participants use AI to reduce decisions, suggesting cognitive load reduction is a primary motivation.'</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Better — you are explaining meaning.</p>
                  </div>
                  <div className="rounded-md border border-primary/30 bg-secondary/30 p-3">
                    <Badge variant="outline" className="mb-1.5 text-primary border-primary/30">T — Theoretical</Badge>
                    <p className="text-muted-foreground italic">'AI tools in solopreneurship appear to function as anxiety regulators rather than productivity tools — a distinction that challenges efficiency-based frameworks of technology adoption.'</p>
                    <p className="text-xs text-primary/80 mt-1">This is where theory lives. Aim here.</p>
                  </div>
                </div>
              </Section>

              <Section title="When to move from open to focused coding">
                <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed">
                  <li>• You have coded at least 4-5 transcripts.</li>
                  <li>• You are starting to see the same codes appear repeatedly.</li>
                  <li>• You have a sense of which codes feel more significant than others.</li>
                  <li>• The saturation signal shows green on your most frequent codes.</li>
                  <li>• You have written memos about the patterns you are seeing.</li>
                </ul>
              </Section>

              <Section title="How to handle disagreements with your partner">
                <ul className="space-y-2 text-sm text-muted-foreground leading-relaxed">
                  <li>• Disagreements are not errors — they reveal ambiguity in the data.</li>
                  <li>• When the AI flags a drift, read both examples carefully.</li>
                  <li>• If you are genuinely coding different things: split the code into two.</li>
                  <li>• If you are coding the same thing differently: update the definition.</li>
                  <li>• If you genuinely disagree on interpretation: open a memo thread and both write your reasoning. The AI will mediate.</li>
                </ul>
              </Section>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-heading text-base text-foreground mb-3">{title}</h3>
      {children}
    </div>
  );
}
