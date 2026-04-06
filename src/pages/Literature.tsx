import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { extractTextFromDocument } from "@/lib/document-text";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { LiteratureBridgeTab } from "@/components/LiteratureBridgeTab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Upload, BookOpen, FileText, Loader2, ChevronDown, ChevronRight, Sparkles, Trash2, Link2, Palette, Plus, X } from "lucide-react";
import { toast } from "sonner";

type Paper = {
  id: string;
  project_id: string;
  title: string;
  authors: string | null;
  year: number | null;
  core_theoretical_concept: string | null;
  file_url: string | null;
  pdf_text_content: string | null;
  main_argument: string | null;
  theoretical_contribution: string | null;
  relevance_to_domain: string | null;
  key_concepts: any;
  created_at: string;
};

type Theory = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  color: string;
  documents?: { name: string; url: string; text: string }[] | null;
  created_at: string;
};

const THEORY_COLORS = [
  "#0E9E8A", "#4A6CF7", "#E5484D", "#F76B15", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F59E0B", "#6366F1", "#10B981",
  "#EF4444", "#3B82F6", "#A855F7", "#F97316", "#06B6D4",
];

const Literature = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { userId, loading: authLoading } = useCurrentUser();

  const [papers, setPapers] = useState<Paper[]>([]);
  const [theories, setTheories] = useState<Theory[]>([]);
  const [reviewText, setReviewText] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAuthors, setNewAuthors] = useState("");
  const [newYear, setNewYear] = useState("");
  const [newConcept, setNewConcept] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [extractingId, setExtractingId] = useState<string | null>(null);

  // Theory dialog state
  const [theoryDialogOpen, setTheoryDialogOpen] = useState(false);
  const [newTheoryName, setNewTheoryName] = useState("");
  const [newTheoryDesc, setNewTheoryDesc] = useState("");
  const [newTheoryColor, setNewTheoryColor] = useState(THEORY_COLORS[0]);
  const [newTheoryFile, setNewTheoryFile] = useState<File | null>(null);
  const [newTheoryFiles, setNewTheoryFiles] = useState<File[]>([]);

  const loadData = useCallback(async () => {
    if (!projectId) return;
    const [papersRes, projectRes, theoriesRes] = await Promise.all([
      supabase.from("literature_papers").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
      supabase.from("projects").select("literature_review_text").eq("id", projectId).single(),
      supabase.from("theories").select("*").eq("project_id", projectId).order("name"),
    ]);
    if (papersRes.data) setPapers(papersRes.data as Paper[]);
    if (projectRes.data) setReviewText((projectRes.data as any).literature_review_text || "");
    if (theoriesRes.data) setTheories(theoriesRes.data as Theory[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !projectId) { toast.error("Title is required"); return; }
    setUploading(true);
    try {
      let pdfText = "";
      let fileUrl = "";
      if (selectedFile) {
        const { text, warning } = await extractTextFromDocument(selectedFile);
        pdfText = text;
        if (warning) toast.warning(warning);
        const filePath = `${projectId}/lit-${crypto.randomUUID()}-${selectedFile.name}`;
        const { error: uploadErr } = await supabase.storage.from("transcripts").upload(filePath, selectedFile);
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("transcripts").getPublicUrl(filePath);
        fileUrl = urlData.publicUrl;
      }
      const { error } = await supabase.from("literature_papers").insert({
        project_id: projectId, title: newTitle.trim(), authors: newAuthors || null,
        year: newYear ? parseInt(newYear) : null, core_theoretical_concept: newConcept || null,
        file_url: fileUrl || null, pdf_text_content: pdfText || null,
      } as any);
      if (error) throw error;
      toast.success("Paper added");
      setShowUpload(false);
      setNewTitle(""); setNewAuthors(""); setNewYear(""); setNewConcept(""); setSelectedFile(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const extractConcepts = async (paper: Paper) => {
    setExtractingId(paper.id);
    try {
      const { data: project } = await supabase.from("projects").select("domain_framework").eq("id", projectId!).single();
      const { data, error } = await supabase.functions.invoke("ai-extract-literature", {
        body: { title: paper.title, authors: paper.authors, core_theoretical_concept: paper.core_theoretical_concept, pdf_text: paper.pdf_text_content, domain_framework: project?.domain_framework },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      await supabase.from("literature_papers").update({
        main_argument: data.main_argument, theoretical_contribution: data.theoretical_contribution,
        relevance_to_domain: data.relevance_to_domain, key_concepts: data.key_concepts,
      } as any).eq("id", paper.id);
      toast.success("Concepts extracted");
      loadData();
    } catch (err: any) {
      console.error("Extract failed:", err);
      toast.error("Extraction failed");
    } finally {
      setExtractingId(null);
    }
  };

  const deletePaper = async (id: string) => {
    const { error } = await supabase.from("literature_papers").delete().eq("id", id);
    if (error) { toast.error("Delete failed"); return; }
    toast.success("Paper removed");
    loadData();
  };

  const saveReview = async () => {
    const { error } = await supabase.from("projects").update({ literature_review_text: reviewText } as any).eq("id", projectId!);
    if (error) { toast.error("Save failed"); return; }
    toast.success("Literature review saved");
  };

  const createTheory = async () => {
    if (!newTheoryName.trim() || !projectId) return;
    const theoryDocuments = [];
    
    if (newTheoryFiles.length > 0) {
      for (const file of newTheoryFiles) {
        const { text, warning } = await extractTextFromDocument(file);
        if (warning) toast.warning(warning);

        const filePath = `${projectId}/theory-${crypto.randomUUID()}-${file.name}`;
        const { error: uploadErr } = await supabase.storage.from("transcripts").upload(filePath, file);
        if (uploadErr) {
          toast.error(`Failed to upload ${file.name}: ${uploadErr.message}`);
          continue;
        }
        const { data: urlData } = supabase.storage.from("transcripts").getPublicUrl(filePath);
        
        theoryDocuments.push({
          name: file.name,
          url: urlData.publicUrl,
          text: text
        });
      }
    }

    const { error } = await supabase.from("theories").insert({
      project_id: projectId,
      name: newTheoryName.trim(),
      description: newTheoryDesc || null,
      color: newTheoryColor,
      documents: theoryDocuments,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Theory created");
    setNewTheoryName(""); setNewTheoryDesc(""); setNewTheoryColor(THEORY_COLORS[0]);
    setNewTheoryFiles([]);
    setTheoryDialogOpen(false);
    loadData();
  };

  const deleteTheory = async (theoryId: string) => {
    const { error } = await supabase.from("theories").delete().eq("id", theoryId);
    if (error) { toast.error(error.message); return; }
    toast.success("Theory removed");
    loadData();
  };

  if (authLoading || loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-muted-foreground">Loading literature…</p></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[1200px] items-center gap-4 px-8 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}/transcripts`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="font-heading text-xl text-foreground">Literature & Theories</h1>
            <p className="text-xs text-muted-foreground">Papers, theories, concepts & bridges</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1200px] px-8 py-4">
        <Tabs defaultValue="papers">
          <TabsList className="bg-transparent h-auto p-0 gap-4 border-b border-border w-full justify-start rounded-none">
            <TabsTrigger value="papers" className="rounded-none border-b-2 border-transparent px-0 pb-2 pt-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
              Papers & Review
            </TabsTrigger>
            <TabsTrigger value="theories" className="rounded-none border-b-2 border-transparent px-0 pb-2 pt-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
              <Palette className="mr-1.5 h-3.5 w-3.5" />
              Theories
            </TabsTrigger>
            <TabsTrigger value="bridge" className="rounded-none border-b-2 border-transparent px-0 pb-2 pt-3 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
              <Link2 className="mr-1.5 h-3.5 w-3.5" />
              Literature Bridge
            </TabsTrigger>
          </TabsList>

          <TabsContent value="papers" className="mt-8 space-y-10">
            {/* Papers section */}
            <section>
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="font-heading text-lg text-foreground">Papers</h2>
                  <p className="text-xs text-muted-foreground">Upload and extract concepts from academic papers (max 5)</p>
                </div>
                {papers.length < 5 && (
                  <Button size="sm" onClick={() => setShowUpload(!showUpload)}>
                    <Upload className="mr-1.5 h-3.5 w-3.5" /> Add Paper
                  </Button>
                )}
              </div>

              {showUpload && (
                <form onSubmit={handleUpload} className="mb-6 rounded-lg border border-primary/30 bg-card p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Paper Title *</Label>
                      <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Augmentation in Practice" required />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Authors</Label>
                      <Input value={newAuthors} onChange={(e) => setNewAuthors(e.target.value)} placeholder="e.g. Smith & Jones" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Year</Label>
                      <Input type="number" value={newYear} onChange={(e) => setNewYear(e.target.value)} placeholder="2024" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Core Theoretical Concept</Label>
                      <Input value={newConcept} onChange={(e) => setNewConcept(e.target.value)} placeholder="e.g. Augmentation theory" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">PDF / Document File</Label>
                    <Input type="file" accept=".pdf,.txt,.doc,.docx" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={uploading}>{uploading ? "Uploading…" : "Add Paper"}</Button>
                    <Button type="button" variant="ghost" onClick={() => setShowUpload(false)}>Cancel</Button>
                  </div>
                </form>
              )}

              {papers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border py-12 text-center">
                  <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground/20" />
                  <p className="text-sm text-muted-foreground">No papers yet. Add your first academic paper.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {papers.map((paper) => {
                    const isExpanded = expandedId === paper.id;
                    const hasConcepts = paper.key_concepts && paper.key_concepts.length > 0;
                    return (
                      <div key={paper.id} className="rounded-lg border border-border bg-card overflow-hidden">
                        <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setExpandedId(isExpanded ? null : paper.id)}>
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-sm text-foreground">{paper.title}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{paper.authors && `${paper.authors}`}{paper.year && ` (${paper.year})`}</span>
                          </div>
                          {hasConcepts && <Badge variant="outline" className="border-success/40 text-success">EXTRACTED</Badge>}
                          {paper.core_theoretical_concept && <Badge variant="secondary">{paper.core_theoretical_concept}</Badge>}
                        </button>
                        {isExpanded && (
                          <div className="border-t border-border px-4 py-4 space-y-4">
                            <div className="flex items-center gap-2">
                              {paper.pdf_text_content && (
                                <Button size="sm" variant="outline" onClick={() => extractConcepts(paper)} disabled={extractingId === paper.id}>
                                  {extractingId === paper.id ? <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> Extracting…</> : <><Sparkles className="mr-1.5 h-3 w-3" /> Extract key concepts</>}
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deletePaper(paper.id)}>
                                <Trash2 className="mr-1.5 h-3 w-3" /> Remove
                              </Button>
                            </div>
                            {paper.main_argument && (
                              <div className="space-y-3">
                                <div>
                                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Main Argument</p>
                                  <p className="text-sm text-foreground">{paper.main_argument}</p>
                                </div>
                                {paper.theoretical_contribution && (
                                  <div>
                                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Theoretical Contribution</p>
                                    <p className="text-sm text-foreground">{paper.theoretical_contribution}</p>
                                  </div>
                                )}
                                {paper.relevance_to_domain && (
                                  <div>
                                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Relevance to Domain</p>
                                    <p className="text-sm text-foreground">{paper.relevance_to_domain}</p>
                                  </div>
                                )}
                                {hasConcepts && (
                                  <div>
                                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Key Concepts</p>
                                    <div className="grid grid-cols-2 gap-2">
                                      {(paper.key_concepts as any[]).map((kc: any, i: number) => (
                                        <div key={i} className="rounded-sm border border-border bg-secondary/30 p-3">
                                          <p className="text-sm font-medium text-foreground">{kc.name}</p>
                                          <p className="mt-1 text-xs text-muted-foreground">{kc.definition}</p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Literature Review */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-heading text-lg text-foreground">Literature Review Synthesis</h2>
                  <p className="text-xs text-muted-foreground">This will be used by the Literature Bridge to connect your theoretical framework to your emerging codes.</p>
                </div>
                <Button size="sm" variant="outline" onClick={saveReview}>Save</Button>
              </div>
              <Textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} rows={16} className="min-h-[300px] text-sm leading-7" placeholder="Write or paste your literature review here…" onBlur={saveReview} />
            </section>
          </TabsContent>

          {/* Theories Tab */}
          <TabsContent value="theories" className="mt-8">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="font-heading text-xl text-foreground">Theories</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Create theories and assign colors. Codes linked to a theory inherit its color.
                </p>
              </div>
              <Dialog open={theoryDialogOpen} onOpenChange={setTheoryDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" />New Theory</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="font-heading">Create Theory</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">Name *</label>
                      <Input value={newTheoryName} onChange={e => setNewTheoryName(e.target.value)} placeholder="e.g. Institutional Theory" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">Description</label>
                      <Textarea value={newTheoryDesc} onChange={e => setNewTheoryDesc(e.target.value)} rows={3} placeholder="Brief description of the theory…" />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">Color *</label>
                      <div className="flex flex-wrap gap-2">
                        {THEORY_COLORS.map(c => (
                          <button
                            key={c}
                            onClick={() => setNewTheoryColor(c)}
                            className={`h-8 w-8 rounded-full border-2 transition-all ${newTheoryColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">Theory documents</label>
                      <Input 
                        type="file" 
                        accept=".pdf,.txt,.md,.doc,.docx" 
                        multiple 
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          setNewTheoryFiles(prev => [...prev, ...files]);
                        }} 
                      />
                      <p className="mt-1 text-xs text-muted-foreground">Upload theory source documents to keep them attached.</p>
                      
                      {newTheoryFiles.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {newTheoryFiles.map((file, idx) => (
                            <div key={idx} className="flex items-center justify-between rounded-md bg-secondary/50 px-2 py-1 text-xs">
                              <span className="truncate flex-1 pr-2">{file.name}</span>
                              <button 
                                type="button" 
                                onClick={() => setNewTheoryFiles(prev => prev.filter((_, i) => i !== idx))}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button variant="ghost" onClick={() => setTheoryDialogOpen(false)}>Cancel</Button>
                      <Button onClick={createTheory} disabled={!newTheoryName.trim()}>Create Theory</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {theories.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-16 text-center">
                <Palette className="mx-auto mb-4 h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No theories yet. Create your first theory to organize codes by color.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {theories.map(theory => (
                  <div key={theory.id} className="rounded-lg border border-border bg-card p-5">
                    <div className="flex items-start gap-4">
                      <div className="h-5 w-5 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: theory.color }} />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-heading text-base text-foreground">{theory.name}</h3>
                        {theory.description && (
                          <p className="text-sm text-muted-foreground mt-1">{theory.description}</p>
                        )}
                        {theory.documents && theory.documents.length > 0 && (
                          <div className="mt-3 space-y-2">
                            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Attached theory documents</p>
                            {theory.documents.map((doc, idx) => (
                              <div key={idx} className="rounded-md bg-secondary/30 px-3 py-2 flex items-center justify-between">
                                <span className="text-sm text-foreground truncate flex-1 pr-4">{doc.name}</span>
                                {doc.url && (
                                  <a href={doc.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline shrink-0">
                                    Open
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => deleteTheory(theory.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="bridge" className="mt-8">
            <LiteratureBridgeTab projectId={projectId!} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Literature;
