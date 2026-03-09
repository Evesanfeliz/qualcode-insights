import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createProject } from "@/lib/supabase-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, Upload, X, Info } from "lucide-react";
import { toast } from "sonner";

const POPOVER_STYLE = {
  background: "#1C2333",
  border: "1px solid #0E9E8A",
  borderRadius: "8px",
  padding: "16px 20px",
  maxWidth: "340px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
};

const APPROACH_OPTIONS = [
  {
    title: "GROUNDED",
    content: (
      <>
        <p>You let the theory emerge from the data.</p>
        <p style={{ marginTop: "8px" }}>You start with no fixed framework — codes and categories develop from what participants say. Best when your research question is exploratory and you are not testing an existing theory.</p>
        <p style={{ marginTop: "8px", fontStyle: "italic", fontSize: "12px" }}>Example: 'What does AI mean to solopreneurs?' → you discover the answer.</p>
      </>
    )
  },
  {
    title: "CONTENT ANALYSIS",
    content: (
      <>
        <p>You start with a framework and look for evidence of it in the data.</p>
        <p style={{ marginTop: "8px" }}>Codes are defined before you read the transcripts, derived from existing theory. Best when you are testing or extending a known model.</p>
        <p style={{ marginTop: "8px", fontStyle: "italic", fontSize: "12px" }}>Example: 'Does Brynjolfsson's augmentation model apply here?' → you test it.</p>
      </>
    )
  },
  {
    title: "TEMPLATE",
    content: (
      <>
        <p>A hybrid. You start with some pre-defined codes from theory, but remain open to new codes emerging from the data.</p>
        <p style={{ marginTop: "8px" }}>The template is revised as analysis develops. Best for most master's theses — you have a theoretical framework but don't want to miss what the data reveals beyond it.</p>
        <p style={{ marginTop: "8px", fontStyle: "italic", fontSize: "12px" }}>Example: You enter with augmentation theory but let participants redefine what amplification means in their own terms.</p>
      </>
    )
  }
];

const REASONING_OPTIONS = [
  {
    title: "INDUCTIVE",
    content: (
      <>
        <p>You reason from the data upward to theory.</p>
        <p style={{ marginTop: "8px" }}>You make no assumptions before reading — observations accumulate into patterns, patterns into concepts, concepts into theory.</p>
        <p style={{ marginTop: "8px", fontStyle: "italic", fontSize: "12px" }}>Pair with: Grounded approach.</p>
      </>
    )
  },
  {
    title: "DEDUCTIVE",
    content: (
      <>
        <p>You reason from theory downward to data.</p>
        <p style={{ marginTop: "8px" }}>You start with a proposition or hypothesis and test whether your data supports, challenges, or refines it.</p>
        <p style={{ marginTop: "8px", fontStyle: "italic", fontSize: "12px" }}>Pair with: Content Analysis approach.</p>
      </>
    )
  },
  {
    title: "ABDUCTIVE",
    content: (
      <>
        <p>You move back and forth between data and theory.</p>
        <p style={{ marginTop: "8px" }}>You start with a surprising or puzzling observation, form a tentative explanation, then return to the data to test it. This is the most common mode in interpretive business research — it acknowledges that theory and data shape each other.</p>
        <p style={{ marginTop: "8px", fontStyle: "italic", fontSize: "12px" }}>Pair with: Template approach.</p>
      </>
    )
  }
];

const CarouselPopover = ({ 
  options, 
  title, 
  footer,
  open, 
  onOpenChange 
}: { 
  options: typeof APPROACH_OPTIONS;
  title: string;
  footer: string;
  open: boolean; 
  onOpenChange: (v: boolean) => void;
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? options.length - 1 : prev - 1));
  };
  
  const goToNext = () => {
    setCurrentIndex((prev) => (prev === options.length - 1 ? 0 : prev + 1));
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          style={{ color: open ? "#0E9E8A" : "#8B949E", cursor: "pointer", background: "none", border: "none", padding: 0, display: "inline-flex", alignItems: "center" }}
          onMouseEnter={e => (e.currentTarget.style.color = "#0E9E8A")}
          onMouseLeave={e => { if (!open) e.currentTarget.style.color = "#8B949E"; }}
        >
          <Info size={13} strokeWidth={2} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        style={POPOVER_STYLE}
        className="p-0 border-0 shadow-none"
        style={{ ...POPOVER_STYLE, width: "min(320px, calc(100vw - 32px))" }}
        side="bottom"
        align="start"
        avoidCollisions
        collisionPadding={16}
        sideOffset={8}
      >
        <div style={{ padding: "16px 20px", maxWidth: "340px" }}>
          <p style={{ fontWeight: 700, fontSize: "14px", color: "#E6EDF3", marginBottom: "12px" }}>{title}</p>
          
          <div style={{ minHeight: "180px" }}>
            <p style={{ fontWeight: 700, fontSize: "13px", color: "#E6EDF3", marginBottom: "8px" }}>
              {options[currentIndex].title}
            </p>
            <div style={{ fontSize: "13px", color: "#8B949E", lineHeight: "1.7" }}>
              {options[currentIndex].content}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "16px", paddingTop: "12px", borderTop: "1px solid #30363D" }}>
            <button
              type="button"
              onClick={goToPrevious}
              style={{ background: "none", border: "none", color: "#0E9E8A", cursor: "pointer", padding: "4px 8px", fontSize: "13px", fontWeight: 600 }}
            >
              ← Prev
            </button>
            <div style={{ display: "flex", gap: "6px" }}>
              {options.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: idx === currentIndex ? "#0E9E8A" : "#30363D",
                    border: "none",
                    cursor: "pointer",
                    padding: 0
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={goToNext}
              style={{ background: "none", border: "none", color: "#0E9E8A", cursor: "pointer", padding: "4px 8px", fontSize: "13px", fontWeight: 600 }}
            >
              Next →
            </button>
          </div>

          <p style={{ fontSize: "12px", color: "#8B949E", fontStyle: "italic", lineHeight: "1.6", marginTop: "12px" }}>
            {footer}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const ApproachPopover = ({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) => (
  <CarouselPopover
    options={APPROACH_OPTIONS}
    title="Which approach fits your research?"
    footer="Not sure? Template Analysis is the most common choice for business and management master's theses."
    open={open}
    onOpenChange={onOpenChange}
  />
);

const ReasoningPopover = ({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) => (
  <CarouselPopover
    options={REASONING_OPTIONS}
    title="How will you move between data and theory?"
    footer="Abductive reasoning is the most common choice for qualitative business and management research."
    open={open}
    onOpenChange={onOpenChange}
  />
);

const DomainFrameworkField = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const handleFile = async (file: File) => {
    setReading(true);
    try {
      const text = await file.text();
      onChange(value ? value + "\n\n" + text : text);
      setFileName(file.name);
    } catch {
      // silently fail
    } finally {
      setReading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="domain_framework">Domain Framework</Label>
      <p className="text-xs text-muted-foreground">
        Describe your theoretical domain, e.g. &quot;AI as capability amplifier for solopreneurs&quot;
      </p>
      <Textarea
        id="domain_framework"
        placeholder="Describe the theoretical lens or domain framework..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
      />
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={reading}
        >
          <Upload className="mr-2 h-3.5 w-3.5" />
          {reading ? "Reading..." : "Upload document"}
        </Button>
        {fileName && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {fileName}
            <button
              type="button"
              onClick={() => {
                setFileName(null);
                if (fileRef.current) fileRef.current.value = "";
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".txt,.md,.doc,.docx,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
};

const NewProject = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [openPopover, setOpenPopover] = useState<"approach" | "reasoning" | null>(null);
  const [form, setForm] = useState({
    title: "",
    research_question: "",
    approach: "",
    reasoning_mode: "",
    domain_framework: "",
    collaborator_email: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Project title is required");
      return;
    }
    setLoading(true);
    try {
      await createProject({
        title: form.title,
        research_question: form.research_question,
        approach: form.approach || undefined,
        reasoning_mode: form.reasoning_mode || undefined,
        domain_framework: form.domain_framework,
        collaborator_email: form.collaborator_email || undefined,
      });
      toast.success("Project created!");
      navigate("/dashboard");
    } catch (error: any) {
      toast.error(error.message || "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-8 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="font-heading text-xl text-foreground">
            QualCode AI
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-8 py-10">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">New Project</CardTitle>
            <CardDescription>
              Set up your qualitative research project
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Project Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g. AI Adoption in SMEs"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="research_question">Research Question</Label>
                <Textarea
                  id="research_question"
                  placeholder="What is the central question guiding this research?"
                  value={form.research_question}
                  onChange={(e) => setForm({ ...form, research_question: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label>Analytical Approach</Label>
                    <ApproachPopover
                      open={openPopover === "approach"}
                      onOpenChange={(v) => setOpenPopover(v ? "approach" : null)}
                    />
                  </div>
                  <Select
                    value={form.approach}
                    onValueChange={(v) => setForm({ ...form, approach: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select approach" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="grounded">Grounded</SelectItem>
                      <SelectItem value="content">Content</SelectItem>
                      <SelectItem value="template">Template</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label>Reasoning Mode</Label>
                    <ReasoningPopover
                      open={openPopover === "reasoning"}
                      onOpenChange={(v) => setOpenPopover(v ? "reasoning" : null)}
                    />
                  </div>
                  <Select
                    value={form.reasoning_mode}
                    onValueChange={(v) => setForm({ ...form, reasoning_mode: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inductive">Inductive</SelectItem>
                      <SelectItem value="deductive">Deductive</SelectItem>
                      <SelectItem value="abductive">Abductive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DomainFrameworkField
                value={form.domain_framework}
                onChange={(val) => setForm({ ...form, domain_framework: val })}
              />

              <div className="space-y-2">
                <Label htmlFor="collaborator_email">
                  Invite Collaborator
                  <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="collaborator_email"
                  type="email"
                  placeholder="colleague@university.edu"
                  value={form.collaborator_email}
                  onChange={(e) => setForm({ ...form, collaborator_email: e.target.value })}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate("/dashboard")}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                >
                  {loading ? "Creating..." : "Create Project"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default NewProject;
