import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/hooks/useOnboarding";
import { ChevronLeft, ChevronRight, Check, User } from "lucide-react";

const Slide1 = () => (
  <div className="space-y-10">
    <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "40px", lineHeight: 1.15 }} className="text-foreground">
      Before we begin — what is qualitative coding?
    </h1>
    <p className="text-muted-foreground text-base leading-[1.8] max-w-[620px]">
      Qualitative coding is how researchers make sense of interview data.
      You read what people said, identify meaningful patterns, and give
      those patterns names — called codes. Over time, codes group into
      categories, categories become themes, and themes become theory.
      It sounds simple. It is actually one of the most intellectually
      demanding things you will do in your thesis.
    </p>
    <div className="flex items-center gap-3 pt-4 overflow-x-auto">
      {["Interview data", "Codes", "Categories", "Themes", "Theory"].map((label, i) => (
        <div key={label} className="flex items-center gap-3">
          <div className="rounded-md border border-primary/40 bg-card px-5 py-3 text-center whitespace-nowrap">
            <span className="font-body text-[13px] text-foreground">{label}</span>
          </div>
          {i < 4 && (
            <svg width="24" height="12" viewBox="0 0 24 12" className="shrink-0">
              <path d="M0 6h20m-4-4l4 4-4 4" stroke="hsl(172,83%,33%)" strokeWidth="1.5" fill="none" />
            </svg>
          )}
        </div>
      ))}
    </div>
  </div>
);

const Slide2 = () => (
  <div className="space-y-8">
    <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "40px", lineHeight: 1.15 }} className="text-foreground">
      What QualCode AI does — and what it does not do
    </h1>
    <div className="grid grid-cols-2 gap-8">
      <div className="space-y-4">
        <p className="text-primary font-semibold text-sm">The AI does this</p>
        {[
          "Suggests codes for text you select",
          "Tells you how analytical your memos are",
          "Detects when you and your partner code inconsistently",
          "Challenges your emerging theory with counter-evidence",
          "Connects your codes to your theoretical literature",
        ].map((item) => (
          <div key={item} className="flex items-start gap-2.5">
            <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span className="text-sm text-muted-foreground leading-relaxed">{item}</span>
          </div>
        ))}
      </div>
      <div className="space-y-4">
        <p className="text-warning font-semibold text-sm">You do this</p>
        {[
          "Decide which codes are right",
          "Interpret what the data means",
          "Build the argument",
          "Write the theory",
          "Defend your choices",
        ].map((item) => (
          <div key={item} className="flex items-start gap-2.5">
            <User className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <span className="text-sm text-muted-foreground leading-relaxed">{item}</span>
          </div>
        ))}
      </div>
    </div>
    <p className="text-muted-foreground/60 text-sm italic pt-2">
      The quality of your research depends on your judgement, not the AI.
    </p>
  </div>
);

const Slide3 = () => (
  <div className="space-y-8">
    <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "40px", lineHeight: 1.15 }} className="text-foreground">
      You will code in two phases
    </h1>
    <div className="grid grid-cols-2 gap-6">
      <div className="rounded-lg border border-primary/40 bg-card p-6 space-y-3">
        <span className="font-mono text-[11px] uppercase tracking-wider text-primary">Phase 1</span>
        <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "22px" }} className="text-foreground">Open Coding</h3>
        <p className="text-sm text-muted-foreground leading-[1.7]">
          Read each transcript line by line.
          Select passages and give them short descriptive labels.
          Be generous — code everything that seems interesting.
          Do not worry about categories yet.
          Ask yourself: What is this about? Who is speaking? What are they doing?
        </p>
      </div>
      <div className="rounded-lg border border-warning/40 bg-card p-6 space-y-3">
        <span className="font-mono text-[11px] uppercase tracking-wider text-warning">Phase 2</span>
        <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "22px" }} className="text-foreground">Focused Coding</h3>
        <p className="text-sm text-muted-foreground leading-[1.7]">
          Now look across all your codes.
          Which ones keep appearing? Which mean similar things?
          Group them into categories.
          These categories become the building blocks of your theory.
          Ask yourself: Why is this happening? What does this reveal?
        </p>
      </div>
    </div>
  </div>
);

const slides = [Slide1, Slide2, Slide3];

const OnboardingWelcome = () => {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const { initProgress, updateProgress, progress } = useOnboarding();

  useEffect(() => {
    // Ensure progress row exists
    initProgress();
  }, [initProgress]);

  const handleContinue = async () => {
    if (step < 2) {
      setStep(step + 1);
    } else {
      await updateProgress({ welcome_completed: true });
      navigate("/onboarding/practice");
    }
  };

  const CurrentSlide = slides[step];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8" style={{ backgroundColor: "hsl(220, 20%, 6.5%)" }}>
      <div className="w-full max-w-[680px]">
        <CurrentSlide />
      </div>

      <div className="fixed bottom-10 left-0 right-0 flex items-center justify-center">
        <div className="w-full max-w-[680px] flex items-center justify-between px-8">
          <Button
            variant="ghost"
            onClick={() => setStep(Math.max(0, step - 1))}
            className={step === 0 ? "invisible" : "text-muted-foreground"}
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>

          <div className="flex items-center gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`h-2 w-2 rounded-full transition-colors ${i === step ? "bg-primary" : "bg-muted-foreground/30"}`}
              />
            ))}
          </div>

          <Button onClick={handleContinue} className="gap-1">
            {step === 2 ? "Start the practice session" : "Continue"}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingWelcome;
