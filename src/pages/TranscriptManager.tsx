import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Upload, FileText, Calendar, User, BookOpen, StickyNote, BookMarked, Lightbulb, Network, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Transcript = {
  id: string;
  project_id: string;
  participant_pseudonym: string;
  file_url: string | null;
  content: string;
  word_count: number | null;
  interview_date: string | null;
  assigned_to: string | null;
  status: string | null;
  created_at: string;
};

type ProjectMember = {
  user_id: string;
  role: string | null;
  color_theme: string | null;
};

const statusLabel: Record<string, string> = {
  uploaded: "UPLOADED",
  in_progress: "IN PROGRESS",
  coded: "CODED",
};

const statusDot: Record<string, string> = {
  uploaded: "bg-muted-foreground",
  in_progress: "bg-primary",
  coded: "bg-success",
};

const TranscriptManager = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [projectTitle, setProjectTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [newTranscript, setNewTranscript] = useState({
    pseudonym: "",
    interviewDate: "",
    assignedTo: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const loadData = useCallback(async () => {
    if (!projectId) return;
    try {
      const [transcriptRes, memberRes, projectRes] = await Promise.all([
        supabase.from("transcripts").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
        supabase.from("project_members").select("user_id, role, color_theme").eq("project_id", projectId),
        supabase.from("projects").select("title").eq("id", projectId).single(),
      ]);
      if (transcriptRes.error) throw transcriptRes.error;
      if (memberRes.error) throw memberRes.error;
      setTranscripts((transcriptRes.data ?? []) as Transcript[]);
      setMembers((memberRes.data ?? []) as ProjectMember[]);
      if (projectRes.data) setProjectTitle(projectRes.data.title);
    } catch (err: any) {
      toast.error("Failed to load transcripts");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      loadData();
    };
    checkAuth();
  }, [navigate, loadData]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !newTranscript.pseudonym.trim() || !projectId) {
      toast.error("Please fill in required fields and select a file");
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      let content = "";
      if (selectedFile.name.endsWith(".txt")) {
        content = await selectedFile.text();
      } else if (selectedFile.name.endsWith(".pdf")) {
        content = await selectedFile.text();
      }

      const filePath = `${projectId}/${crypto.randomUUID()}-${selectedFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("transcripts")
        .upload(filePath, selectedFile);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("transcripts").getPublicUrl(filePath);

      const wordCount = content.split(/\s+/).filter(Boolean).length;

      const { error: insertError } = await supabase.from("transcripts").insert({
        project_id: projectId,
        participant_pseudonym: newTranscript.pseudonym,
        file_url: urlData.publicUrl,
        content,
        word_count: wordCount,
        interview_date: newTranscript.interviewDate || null,
        assigned_to: newTranscript.assignedTo || null,
        status: "uploaded",
      });
      if (insertError) throw insertError;

      toast.success("Transcript uploaded!");
      setDialogOpen(false);
      setNewTranscript({ pseudonym: "", interviewDate: "", assignedTo: "" });
      setSelectedFile(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const getMemberLabel = (userId: string) => {
    const idx = members.findIndex((m) => m.user_id === userId);
    return idx === 0 ? "Researcher A" : idx === 1 ? "Researcher B" : "Unknown";
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[1200px] items-center gap-4 px-8 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="font-heading text-xl text-foreground">
              {projectTitle || "Project"}
            </h1>
            <p className="text-xs text-muted-foreground">Transcript Manager</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/project/${projectId}/codebook`)}>
              <BookOpen className="mr-1.5 h-3.5 w-3.5" />
              Codebook
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/project/${projectId}/memos`)}>
              <StickyNote className="mr-1.5 h-3.5 w-3.5" />
              Memos
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/project/${projectId}/literature`)}>
              <BookMarked className="mr-1.5 h-3.5 w-3.5" />
              Literature
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/project/${projectId}/theory`)}>
              <Lightbulb className="mr-1.5 h-3.5 w-3.5" />
              Theory
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-8 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="font-heading text-2xl text-foreground">Transcripts</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload and manage interview transcripts
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="mr-2 h-4 w-4" />
                Upload Transcript
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="font-heading">Upload Transcript</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleUpload} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pseudonym">Participant Pseudonym *</Label>
                  <Input
                    id="pseudonym"
                    placeholder="e.g. P1, Participant Alpha"
                    value={newTranscript.pseudonym}
                    onChange={(e) => setNewTranscript({ ...newTranscript, pseudonym: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="interviewDate">Interview Date</Label>
                  <Input
                    id="interviewDate"
                    type="date"
                    value={newTranscript.interviewDate}
                    onChange={(e) => setNewTranscript({ ...newTranscript, interviewDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Assign to Researcher</Label>
                  <Select
                    value={newTranscript.assignedTo}
                    onValueChange={(v) => setNewTranscript({ ...newTranscript, assignedTo: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select researcher" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((m, i) => (
                        <SelectItem key={m.user_id} value={m.user_id}>
                          {i === 0 ? "Researcher A" : "Researcher B"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="file">Transcript File (.txt or .pdf) *</Label>
                  <Input
                    id="file"
                    type="file"
                    accept=".txt,.pdf"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    required
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={uploading}
                  >
                    {uploading ? "Uploading..." : "Upload"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg border border-border bg-card" />
            ))}
          </div>
        ) : transcripts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-16 text-center">
            <FileText className="mx-auto mb-4 h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              No transcripts yet. Upload your first interview transcript.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {transcripts.map((t) => (
              <button
                key={t.id}
                className="flex w-full items-center gap-4 rounded-lg border border-border bg-card px-6 py-4 text-left transition-colors hover:bg-secondary"
                onClick={() => navigate(`/project/${projectId}/code/${t.id}`)}
              >
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <span className="font-heading text-base text-foreground">
                    {t.participant_pseudonym}
                  </span>
                  <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                    {t.interview_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(t.interview_date), "MMM d, yyyy")}
                      </span>
                    )}
                    {t.assigned_to && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {getMemberLabel(t.assigned_to)}
                      </span>
                    )}
                    {t.word_count && (
                      <span className="font-mono text-[10px]">{t.word_count.toLocaleString()} words</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${statusDot[t.status || "uploaded"]}`} />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {statusLabel[t.status || "uploaded"]}
                  </span>
                </div>

                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default TranscriptManager;
