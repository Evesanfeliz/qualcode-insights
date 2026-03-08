import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { createProject } from "@/lib/supabase-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Upload, X } from "lucide-react";
import { toast } from "sonner";

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
    <div className="min-h-screen bg-secondary">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-6 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="font-heading text-xl font-bold text-primary">
            QualCode AI
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="font-heading text-2xl">New Project</CardTitle>
            <CardDescription>
              Set up your qualitative research project
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Title */}
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

              {/* Research Question */}
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

              {/* Approach + Reasoning Mode */}
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Analytical Approach</Label>
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
                  <Label>Reasoning Mode</Label>
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

              {/* Domain Framework */}
              <DomainFrameworkField
                value={form.domain_framework}
                onChange={(val) => setForm({ ...form, domain_framework: val })}
              />

              {/* Collaborator */}
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

              {/* Submit */}
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/dashboard")}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-accent text-accent-foreground hover:bg-accent/90"
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
