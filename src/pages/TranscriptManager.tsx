import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { extractTextFromDocument } from "@/lib/document-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Upload, FileText, Calendar, User, BookOpen, StickyNote, BookMarked, Lightbulb, Network, ChevronRight, HelpCircle, X, Users, Pencil, Trash2 } from "lucide-react";
import { HelpModal } from "@/components/HelpModal";
import { toast } from "sonner";
import { format } from "date-fns";
import { ProjectInviteModal } from "@/components/ProjectInviteModal";

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
  display_name: string | null;
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  // Upload state
  const [newTranscript, setNewTranscript] = useState({
    pseudonym: "",
    interviewDate: "",
    assignedTo: "",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit transcript state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTranscript, setEditingTranscript] = useState<Transcript | null>(null);
  const [editForm, setEditForm] = useState({
    pseudonym: "",
    interviewDate: "",
    assignedTo: "",
    status: "",
  });
  const [editLoading, setEditLoading] = useState(false);

  // Delete transcript state
  const [transcriptToDelete, setTranscriptToDelete] = useState<Transcript | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!projectId) return;
    try {
      const [transcriptRes, memberRes, projectRes] = await Promise.all([
        supabase.from("transcripts").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
        supabase.from("project_members").select("user_id, role, color_theme, display_name").eq("project_id", projectId),
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

  const getMemberLabel = (userId: string) => {
    const member = members.find((m) => m.user_id === userId);
    if (member?.display_name) return member.display_name;
    const idx = members.findIndex((m) => m.user_id === userId);
    return idx === 0 ? "Researcher A" : idx === 1 ? "Researcher B" : "Unknown";
  };

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

      const { text: content, warning } = await extractTextFromDocument(selectedFile);
      if (warning) toast.warning(warning);

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

  const openEditDialog = (t: Transcript) => {
    setEditingTranscript(t);
    setEditForm({
      pseudonym: t.participant_pseudonym,
      interviewDate: t.interview_date ?? "",
      assignedTo: t.assigned_to ?? "",
      status: t.status ?? "uploaded",
    });
    setEditDialogOpen(true);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTranscript || !editForm.pseudonym.trim()) {
      toast.error("Pseudonym is required");
      return;
    }
    setEditLoading(true);
    try {
      const { error } = await supabase
        .from("transcripts")
        .update({
          participant_pseudonym: editForm.pseudonym.trim(),
          interview_date: editForm.interviewDate || null,
          assigned_to: editForm.assignedTo || null,
          status: editForm.status || "uploaded",
        })
        .eq("id", editingTranscript.id);
      if (error) throw error;
      toast.success("Transcript updated");
      setEditDialogOpen(false);
      setEditingTranscript(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update transcript");
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteTranscript = async () => {
    if (!transcriptToDelete) return;
    setDeletingId(transcriptToDelete.id);
    try {
      const { error } = await supabase
        .from("transcripts")
        .delete()
        .eq("id", transcriptToDelete.id);
      if (error) throw error;
      toast.success(`Transcript "${transcriptToDelete.participant_pseudonym}" deleted`);
      setTranscriptToDelete(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete transcript");
    } finally {
      setDeletingId(null);
    }
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
          <div className="flex items-center gap-2" data-tour="sidebar">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/project/${projectId}/transcripts`)} data-tour="transcripts-link">
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              Transcripts
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/project/${projectId}/codebook`)} data-tour="codebook-link">
              <BookOpen className="mr-1.5 h-3.5 w-3.5" />
              Codebook
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/project/${projectId}/memos`)} data-tour="memos-link">
              <StickyNote className="mr-1.5 h-3.5 w-3.5" />
              Memos
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/project/${projectId}/literature`)} data-tour="literature-link">
              <BookMarked className="mr-1.5 h-3.5 w-3.5" />
              Literature
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/project/${projectId}/theory`)} data-tour="theory-link">
              <Lightbulb className="mr-1.5 h-3.5 w-3.5" />
              Theory
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/project/${projectId}/canvas`)} data-tour="canvas-link">
              <Network className="mr-1.5 h-3.5 w-3.5" />
              Canvas
            </Button>
            <div className="w-px h-5 bg-border mx-1" />
            <Button variant="ghost" size="sm" onClick={() => setHelpOpen(true)} data-tour="help-link">
              <HelpCircle className="mr-1.5 h-3.5 w-3.5" />
              Help
            </Button>
            <div className="w-px h-5 bg-border mx-1" />
            <Button variant="ghost" size="sm" onClick={() => setInviteOpen(true)} className="text-primary hover:text-primary hover:bg-primary/10">
              <Users className="mr-1.5 h-3.5 w-3.5" />
              Invite
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
                          {m.display_name || (i === 0 ? "Researcher A" : "Researcher B")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="file">Transcript File (.txt, .md, .pdf, .doc, or .docx) *</Label>
                  <div className="rounded-xl border border-dashed border-primary/25 bg-gradient-to-br from-secondary/30 via-background to-secondary/10 p-5">
                    <div className="flex flex-col items-start gap-4 text-left">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          Select the transcript document to upload
                        </p>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          Accepted formats: .txt, .md, .pdf, .doc, and .docx
                        </p>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-4 w-4" />
                        {selectedFile ? "Replace File" : "Select Transcript File"}
                      </Button>
                    </div>

                    {selectedFile ? (
                      <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-3 text-sm text-foreground shadow-sm">
                        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{selectedFile.name}</p>
                          <p className="text-xs text-muted-foreground">File selected and ready to upload</p>
                        </div>
                        <button
                          type="button"
                          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                          onClick={() => {
                            setSelectedFile(null);
                            if (fileInputRef.current) fileInputRef.current.value = "";
                          }}
                          aria-label="Remove selected file"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-lg bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                        No file selected yet.
                      </div>
                    )}

                    <Input
                      ref={fileInputRef}
                      id="file"
                      type="file"
                      accept=".txt,.md,.pdf,.doc,.docx"
                      className="hidden"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      required
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={uploading}>
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
              <div
                key={t.id}
                className="group flex w-full items-center gap-4 rounded-lg border border-border bg-card px-6 py-4 transition-colors hover:bg-secondary"
              >
                {/* Clickable main area */}
                <button
                  className="flex flex-1 min-w-0 items-center gap-4 text-left"
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

                  <div className="flex items-center gap-2 shrink-0">
                    <div className={`h-2 w-2 rounded-full ${statusDot[t.status || "uploaded"]}`} />
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {statusLabel[t.status || "uploaded"]}
                    </span>
                  </div>

                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>

                {/* Edit & Delete actions — always visible on hover */}
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    title="Edit transcript"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditDialog(t);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    title="Delete transcript"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTranscriptToDelete(t);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Edit Transcript Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Edit Transcript</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-pseudonym">Participant Pseudonym *</Label>
              <Input
                id="edit-pseudonym"
                placeholder="e.g. P1, Participant Alpha"
                value={editForm.pseudonym}
                onChange={(e) => setEditForm({ ...editForm, pseudonym: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-date">Interview Date</Label>
              <Input
                id="edit-date"
                type="date"
                value={editForm.interviewDate}
                onChange={(e) => setEditForm({ ...editForm, interviewDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Assign to Researcher</Label>
              <Select
                value={editForm.assignedTo}
                onValueChange={(v) => setEditForm({ ...editForm, assignedTo: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select researcher" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">— Unassigned —</SelectItem>
                  {members.map((m, i) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.display_name || (i === 0 ? "Researcher A" : "Researcher B")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={editForm.status}
                onValueChange={(v) => setEditForm({ ...editForm, status: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uploaded">Uploaded</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="coded">Coded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={editLoading}>
                {editLoading ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Transcript Confirmation */}
      <AlertDialog open={!!transcriptToDelete} onOpenChange={(open) => !open && setTranscriptToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transcript?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{transcriptToDelete?.participant_pseudonym}"? This will permanently remove the transcript and all its code applications. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTranscript}
              disabled={!!deletingId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingId ? "Deleting..." : "Delete Transcript"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <HelpModal open={helpOpen} onOpenChange={setHelpOpen} />
      <ProjectInviteModal projectId={projectId!} isOpen={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
};

export default TranscriptManager;
