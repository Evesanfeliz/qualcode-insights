import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Sparkles, Loader2, Quote, FolderTree, Layers3, StickyNote, Highlighter, ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";

type Transcript = { id: string; project_id: string; participant_pseudonym: string; content: string };
type Code = { id: string; project_id: string; label: string; color: string | null; origin: string | null };
type CodeApplication = { id: string; code_id: string; transcript_id: string; applied_by: string; segment_text: string; start_index: number; end_index: number; note: string | null };
type ProjectMember = { user_id: string; role: string | null; color_theme: string | null };
type Project = { id: string; research_question: string | null; domain_framework: string | null; approach: string | null };
type Theory = { id: string; project_id: string; name: string; color: string; description: string | null };
type AISuggestion = { label: string; justification: string; domain_connection: string; confidence: "high" | "medium" | "low" };
type HighlightGroup = { key: string; start: number; end: number; text: string; codes: Code[] };
type ProjectCodeApplication = CodeApplication & { transcript?: { id: string; participant_pseudonym: string } | null };
type Category = { id: string; project_id: string; name: string; description: string | null; color: string | null; created_by: string | null; parent_category_id: string | null; source_code_id: string | null };
type Theme = { id: string; project_id: string; name: string; description: string | null; color: string | null; created_by: string | null };
type CodeCategory = { id: string; project_id: string; code_id: string; category_id: string };
type CategoryTheme = { id: string; project_id: string; category_id: string; theme_id: string };
type TranscriptAnnotation = {
  id: string;
  project_id: string;
  transcript_id: string;
  start_index: number;
  end_index: number;
  selected_text: string;
  content: string;
  created_by: string | null;
};

type AnnotationGroup = {
  key: string;
  start: number;
  end: number;
  notes: TranscriptAnnotation[];
};

const confidenceBadge: Record<string, string> = {
  high: "border-primary/40 text-primary",
  medium: "border-warning/40 text-warning",
  low: "border-muted-foreground/30 text-muted-foreground",
};

const originBadgeStyles: Record<string, { label: string; className: string } | null> = {
  in_vivo: { label: "IN VIVO", className: "border-primary/60 text-primary" },
  researcher: null,
  a_priori: { label: "A PRIORI", className: "border-indigo-500/60 text-indigo-600" },
  ai_suggested: { label: "AI", className: "border-amber-500/60 text-amber-600" },
};

const getCodeAccent = (color: string | null) => color || "hsl(var(--muted-foreground))";

const CodingWorkspace = () => {
  const { projectId, transcriptId } = useParams<{ projectId: string; transcriptId: string }>();
  const navigate = useNavigate();
  const contentRef = useRef<HTMLDivElement>(null);

  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [codes, setCodes] = useState<Code[]>([]);
  const [applications, setApplications] = useState<CodeApplication[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [analysisTab, setAnalysisTab] = useState("codes");
  const [fontScale, setFontScale] = useState(14);
  const [selectedCodeFocusId, setSelectedCodeFocusId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState<"code" | "note">("code");

  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const [newCodeLabel, setNewCodeLabel] = useState("");
  const [newCodeTheoryId, setNewCodeTheoryId] = useState("none");
  const [selectedCodeIds, setSelectedCodeIds] = useState<string[]>([]);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [showInVivoTooltip, setShowInVivoTooltip] = useState(false);
  const [projectApplications, setProjectApplications] = useState<ProjectCodeApplication[]>([]);
  const [annotations, setAnnotations] = useState<TranscriptAnnotation[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [theories, setTheories] = useState<Theory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [codeCategories, setCodeCategories] = useState<CodeCategory[]>([]);
  const [categoryThemes, setCategoryThemes] = useState<CategoryTheme[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newThemeName, setNewThemeName] = useState("");
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<string[]>([]);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-radix-popper-content-wrapper]")) {
        return;
      }
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
        setSelection(null);
        setAiSuggestions([]);
        window.getSelection()?.removeAllRanges();
      }
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handleClickOutside), 100);
    return () => { clearTimeout(timer); document.removeEventListener("mousedown", handleClickOutside); };
  }, [popoverOpen]);

  const loadData = useCallback(async () => {
    if (!projectId || !transcriptId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }
      setCurrentUserId(user.id);

      const [tRes, pRes, cRes, aRes, mRes, projectAppsRes, annotationRes, theoryRes, catRes, themeRes, codeCatRes, categoryThemeRes] = await Promise.all([
        supabase.from("transcripts").select("id, project_id, participant_pseudonym, content").eq("id", transcriptId).single(),
        supabase.from("projects").select("id, research_question, domain_framework, approach").eq("id", projectId).single(),
        supabase.from("codes").select("*").eq("project_id", projectId).order("label"),
        supabase.from("code_applications").select("*").eq("transcript_id", transcriptId),
        supabase.from("project_members").select("user_id, role, color_theme").eq("project_id", projectId),
        supabase
          .from("code_applications")
          .select("id, code_id, transcript_id, applied_by, segment_text, start_index, end_index, note, transcript:transcripts!inner(id, participant_pseudonym, project_id)")
          .eq("transcript.project_id", projectId),
        supabase.from("transcript_annotations" as any).select("*").eq("transcript_id", transcriptId),
        supabase.from("theories").select("id, project_id, name, color, description").eq("project_id", projectId).order("name"),
        supabase.from("categories" as any).select("*").eq("project_id", projectId).order("name"),
        supabase.from("themes" as any).select("*").eq("project_id", projectId).order("name"),
        supabase.from("code_categories" as any).select("*").eq("project_id", projectId),
        supabase.from("category_themes" as any).select("*").eq("project_id", projectId),
      ]);

      if (tRes.error) throw tRes.error;
      setTranscript(tRes.data as Transcript);
      if (pRes.data) setProject(pRes.data as Project);
      setCodes((cRes.data ?? []) as Code[]);
      setApplications((aRes.data ?? []) as CodeApplication[]);
      setMembers((mRes.data ?? []) as ProjectMember[]);
      setProjectApplications((projectAppsRes.data ?? []) as ProjectCodeApplication[]);
      setAnnotations((annotationRes.data ?? []) as TranscriptAnnotation[]);
      setTheories((theoryRes.data ?? []) as Theory[]);
      setCategories((catRes.data ?? []) as Category[]);
      setThemes((themeRes.data ?? []) as Theme[]);
      setCodeCategories((codeCatRes.data ?? []) as CodeCategory[]);
      setCategoryThemes((categoryThemeRes.data ?? []) as CategoryTheme[]);
    } catch (err: any) {
      toast.error("Failed to load workspace");
    } finally {
      setLoading(false);
    }
  }, [projectId, transcriptId, navigate]);

  useEffect(() => { loadData(); }, [loadData]);

  const getHighlightColor = (codeColor: string | null) => {
    const hex = codeColor || "#0E9E8A";
    // Convert hex to rgba with low opacity for light bg
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    return `rgba(${r}, ${g}, ${b}, 0.12)`;
  };

  const findClosestSelectionMatch = useCallback((fullText: string, selectedText: string, approximateStart: number) => {
    if (!selectedText) return null;

    const matches: number[] = [];
    let searchIndex = fullText.indexOf(selectedText);
    while (searchIndex !== -1) {
      matches.push(searchIndex);
      searchIndex = fullText.indexOf(selectedText, searchIndex + 1);
    }

    if (matches.length === 0) return null;

    return matches.reduce((closest, current) =>
      Math.abs(current - approximateStart) < Math.abs(closest - approximateStart) ? current : closest,
    );
  }, []);

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !contentRef.current || !transcript) return;
    const range = sel.getRangeAt(0);
    const rawSelectedText = sel.toString();
    const selectedText = rawSelectedText.trim();
    if (!selectedText) return;
    const preRange = document.createRange();
    preRange.selectNodeContents(contentRef.current);
    preRange.setEnd(range.startContainer, range.startOffset);
    const approximateStart = preRange.toString().length + (rawSelectedText.length - rawSelectedText.trimStart().length);
    const matchedStart = findClosestSelectionMatch(transcript.content, selectedText, approximateStart);
    const startIndex = matchedStart ?? approximateStart;
    const endIndex = startIndex + selectedText.length;
    const rect = range.getBoundingClientRect();
    setPopoverPos({ x: rect.left + rect.width / 2, y: rect.top - 10 });
    setSelection({ start: startIndex, end: endIndex, text: selectedText });
    setPopoverOpen(true);
    setNewCodeLabel("");
    setNewCodeTheoryId("none");
    setSelectedCodeIds([]);
    setNoteDraft("");
    setAiSuggestions([]);
  }, [findClosestSelectionMatch, transcript]);

  const askAI = async () => {
    if (!selection || !transcript) return;
    setAiLoading(true);
    setAiSuggestions([]);
    try {
      const text = transcript.content;
      const beforeText = text.slice(Math.max(0, selection.start - 300), selection.start);
      const afterText = text.slice(selection.end, Math.min(text.length, selection.end + 300));
      const beforeLines = beforeText.split("\n").slice(-3).join("\n");
      const afterLines = afterText.split("\n").slice(0, 3).join("\n");

      const { data, error } = await supabase.functions.invoke("ai-suggest-codes", {
        body: {
          research_question: project?.research_question || "",
          domain_framework: project?.domain_framework || "",
          approach: project?.approach || "",
          existing_codes: codes.map((c) => c.label).join(", "),
          selected_text: selection.text,
          surrounding_context: `${beforeLines}\n[SELECTED]\n${afterLines}`,
        },
      });
      if (error) throw error;
      if (data?.suggestions) {
        setAiSuggestions(data.suggestions);
      } else if (data?.error) {
        toast.error(data.error);
      }
    } catch (err: any) {
      toast.error(err.message || "AI suggestion failed");
    } finally {
      setAiLoading(false);
    }
  };

  const applyCode = async (originOverride?: string) => {
    if (!selection || !transcript || !projectId) return;
    try {
      const codeIds = [...selectedCodeIds];
      if (newCodeLabel.trim()) {
        const origin = originOverride || "researcher";
        const selectedTheory = theories.find((theory) => theory.id === newCodeTheoryId);
        const { data, error } = await supabase
          .from("codes")
          .insert({
            project_id: projectId,
            label: newCodeLabel.trim(),
            origin,
            theory_id: newCodeTheoryId !== "none" ? newCodeTheoryId : null,
            color: selectedTheory?.color || null,
          })
          .select()
          .single();
        if (error) throw error;
        codeIds.push(data.id);
      }
      const uniqueCodeIds = Array.from(new Set(codeIds));
      if (uniqueCodeIds.length === 0) { toast.error("Please enter a new code name or choose at least one existing code"); return; }

      const existingForRange = applications.filter((app) =>
        app.transcript_id === transcript.id &&
        app.start_index === selection.start &&
        app.end_index === selection.end,
      );
      const existingIds = new Set(existingForRange.map((app) => app.code_id));
      const inserts = uniqueCodeIds
        .filter((codeId) => !existingIds.has(codeId))
        .map((codeId) => ({
          code_id: codeId,
          transcript_id: transcript.id,
          applied_by: currentUserId,
          segment_text: selection.text,
          start_index: selection.start,
          end_index: selection.end,
        }));

      if (inserts.length === 0) {
        toast.info("Those codes are already applied to this exact selection");
        return;
      }

      const { error } = await supabase.from("code_applications").insert(inserts);
      if (error) throw error;
      toast.success(inserts.length === 1 ? "Code applied!" : `${inserts.length} codes applied!`);
      setPopoverOpen(false);
      setSelection(null);
      setAiSuggestions([]);
      setSelectedCodeIds([]);
      window.getSelection()?.removeAllRanges();
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to apply code");
    }
  };

  const applyInVivo = async () => {
    if (!selection || !transcript || !projectId) return;
    try {
      let label = selection.text;
      let truncated = false;
      if (label.length > 60) {
        label = label.slice(0, 60) + "…";
        truncated = true;
      }

      // Check for existing code with same label
      const existing = codes.find((c) => c.label === label);
      let codeId: string;

      if (existing) {
        codeId = existing.id;
      } else {
        const { data, error } = await supabase.from("codes").insert({
          project_id: projectId, label, origin: "in_vivo",
        }).select().single();
        if (error) throw error;
        codeId = data.id;
      }

      const { error } = await supabase.from("code_applications").insert({
        code_id: codeId, transcript_id: transcript.id, applied_by: currentUserId,
        segment_text: selection.text, start_index: selection.start, end_index: selection.end,
      });
      if (error) throw error;

      if (truncated) {
        toast.info("Code label truncated to 60 chars. The full passage is still saved as the coded segment.");
      } else {
        toast.success("In vivo code applied!");
      }

      // Show educational tooltip on first use
      const hasSeenTooltip = localStorage.getItem("invivo_tooltip_seen");
      const hadInVivoBefore = codes.some((c) => c.origin === "in_vivo");
      if (!hasSeenTooltip && !hadInVivoBefore) {
        setShowInVivoTooltip(true);
      }

      setPopoverOpen(false);
      setSelection(null);
      setAiSuggestions([]);
      window.getSelection()?.removeAllRanges();
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to apply in vivo code");
    }
  };

  const saveNote = async () => {
    if (!selection || !transcript || !projectId || !noteDraft.trim()) return;
    try {
      const { error } = await supabase.from("transcript_annotations" as any).insert({
        project_id: projectId,
        transcript_id: transcript.id,
        start_index: selection.start,
        end_index: selection.end,
        selected_text: selection.text,
        content: noteDraft.trim(),
        created_by: currentUserId,
      });
      if (error) throw error;
      toast.success("Note added");
      setPopoverOpen(false);
      setSelection(null);
      setNoteDraft("");
      window.getSelection()?.removeAllRanges();
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save note");
    }
  };

  const codeFrequency = useMemo(() => {
    const freq: Record<string, number> = {};
    applications.forEach((a) => { freq[a.code_id] = (freq[a.code_id] || 0) + 1; });
    return freq;
  }, [applications]);

  const projectCodeStats = useMemo(() => {
    const stats: Record<string, { uses: number; interviews: Set<string>; byTranscript: Record<string, ProjectCodeApplication[]> }> = {};

    projectApplications.forEach((app) => {
      if (!stats[app.code_id]) {
        stats[app.code_id] = { uses: 0, interviews: new Set(), byTranscript: {} };
      }
      stats[app.code_id].uses += 1;
      stats[app.code_id].interviews.add(app.transcript_id);
      if (!stats[app.code_id].byTranscript[app.transcript_id]) {
        stats[app.code_id].byTranscript[app.transcript_id] = [];
      }
      stats[app.code_id].byTranscript[app.transcript_id].push(app);
    });

    return stats;
  }, [projectApplications]);

  const highlightGroups = useMemo<HighlightGroup[]>(() => {
    const groups = new Map<string, HighlightGroup>();

    applications.forEach((app) => {
      const code = codes.find((item) => item.id === app.code_id);
      if (!code) return;
      const key = `${app.start_index}-${app.end_index}`;
      const existing = groups.get(key);
      if (existing) {
        existing.codes.push(code);
        return;
      }
      groups.set(key, {
        key,
        start: app.start_index,
        end: app.end_index,
        text: app.segment_text,
        codes: [code],
      });
    });

    return Array.from(groups.values()).sort((a, b) => a.start - b.start || a.end - b.end);
  }, [applications, codes]);

  const annotationGroups = useMemo<AnnotationGroup[]>(() => {
    const groups = new Map<string, AnnotationGroup>();

    annotations.forEach((annotation) => {
      const key = `${annotation.start_index}-${annotation.end_index}`;
      const existing = groups.get(key);
      if (existing) {
        existing.notes.push(annotation);
        return;
      }

      groups.set(key, {
        key,
        start: annotation.start_index,
        end: annotation.end_index,
        notes: [annotation],
      });
    });

    return Array.from(groups.values()).sort((a, b) => a.start - b.start || a.end - b.end);
  }, [annotations]);

  const scrollToCode = (codeId: string) => {
    const app = applications.find((a) => a.code_id === codeId);
    if (!app || !contentRef.current) return;
    const marks = contentRef.current.querySelectorAll("mark");
    for (const mark of marks) {
      const codeIds = (mark.getAttribute("data-code-ids") || "").split(",").filter(Boolean);
      if (codeIds.includes(codeId)) {
        mark.scrollIntoView({ behavior: "smooth", block: "center" });
        mark.style.outline = "2px solid hsl(var(--primary))";
        setTimeout(() => { mark.style.outline = "none"; }, 1500);
        break;
      }
    }
  };

  const truncatePreview = (text: string, max: number) =>
    text.length > max ? `${text.slice(0, max)}…` : text;

  const toggleCodeSelection = (codeId: string, checked: boolean) => {
    setSelectedCodeIds((current) => checked
      ? [...current, codeId]
      : current.filter((id) => id !== codeId));
  };

  const renderedTranscript = useMemo(() => {
    if (!transcript) return null;
    const text = transcript.content;
    if (highlightGroups.length === 0 && annotationGroups.length === 0) return text;

    const boundaries = new Set<number>([0, text.length]);
    highlightGroups.forEach((group) => {
      boundaries.add(group.start);
      boundaries.add(group.end);
    });
    annotationGroups.forEach((group) => {
      boundaries.add(group.start);
      boundaries.add(group.end);
    });

    const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b);

    const parts: React.ReactNode[] = [];

    for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
      const start = sortedBoundaries[index];
      const end = sortedBoundaries[index + 1];
      if (start === end) continue;

      const segmentText = text.slice(start, end);
      const coveringHighlights = highlightGroups.filter((group) => group.start <= start && group.end >= end);
      const coveringAnnotations = annotationGroups.filter((group) => group.start <= start && group.end >= end);

      if (coveringHighlights.length === 0 && coveringAnnotations.length === 0) {
        parts.push(segmentText);
        continue;
      }

      const primaryHighlight = coveringHighlights[0];
      const primaryColor = primaryHighlight?.codes[0]?.color || "#D97706";
      const hasInVivo = coveringHighlights.some((group) => group.codes.some((code) => code.origin === "in_vivo"));
      const codeLabels = coveringHighlights.flatMap((group) => group.codes.map((code) => code.label));
      const notePreview = coveringAnnotations
        .flatMap((group) => group.notes.map((note) => note.content))
        .slice(0, 2)
        .join(" • ");
      const startingNotes = coveringAnnotations
        .flatMap((group) => group.notes)
        .filter((note) => note.start_index === start);
      const noteTitle = startingNotes.length > 0
        ? truncatePreview(startingNotes.map((note) => note.content).join(" • "), 100)
        : "";

      parts.push(
        <span key={`${start}-${end}`} className="relative">
          <mark
            data-code-ids={coveringHighlights.flatMap((group) => group.codes.map((code) => code.id)).join(",")}
            data-note-title={noteTitle}
            style={{
              backgroundColor: primaryHighlight ? getHighlightColor(primaryColor) : "transparent",
              borderLeft: primaryHighlight ? `2px solid ${primaryColor}` : undefined,
              paddingLeft: primaryHighlight ? "4px" : undefined,
              position: "relative",
            }}
            className={`group/mark rounded-none ${startingNotes.length > 0 ? "before:pointer-events-none before:select-none before:absolute before:-top-6 before:left-[-4px] before:z-10 before:max-w-[340px] before:rounded-sm before:bg-black before:px-2 before:py-1 before:text-[11px] before:font-semibold before:leading-4 before:text-white before:shadow-sm before:content-[attr(data-note-title)] before:whitespace-nowrap" : ""}`}
            title={[
              codeLabels.length > 0 ? codeLabels.join(" • ") : null,
              notePreview || null,
            ].filter(Boolean).join(" — ")}
          >
            {segmentText}
            {coveringHighlights.length > 0 && codeLabels.length > 1 && (
              <span className="absolute -bottom-3 left-1 text-[9px] uppercase tracking-wider text-muted-foreground opacity-0 transition-opacity group-hover/mark:opacity-100">
                {codeLabels.length} codes
              </span>
            )}
            {hasInVivo && (
              <span
                className="absolute -top-0.5 -right-0.5 opacity-0 group-hover/mark:opacity-100 transition-opacity text-[10px] uppercase leading-none pointer-events-none"
                style={{ color: primaryColor }}
              >
                IV
              </span>
            )}
          </mark>
        </span>,
      );
    }

    return parts;
  }, [transcript, highlightGroups, annotationGroups]);

  const codeIdsByCategory = useMemo(() => {
    const mapping: Record<string, string[]> = {};
    codeCategories.forEach((item) => {
      if (!mapping[item.category_id]) mapping[item.category_id] = [];
      mapping[item.category_id].push(item.code_id);
    });
    return mapping;
  }, [codeCategories]);

  const categoryIdsByTheme = useMemo(() => {
    const mapping: Record<string, string[]> = {};
    categoryThemes.forEach((item) => {
      if (!mapping[item.theme_id]) mapping[item.theme_id] = [];
      mapping[item.theme_id].push(item.category_id);
    });
    return mapping;
  }, [categoryThemes]);

  const uncategorizedCodes = useMemo(() => {
    const assigned = new Set(codeCategories.map((item) => item.code_id));
    const convertedToCategories = new Set(
      categories
        .map((category) => category.source_code_id)
        .filter(Boolean) as string[],
    );
    return codes.filter((code) => !assigned.has(code.id) && !convertedToCategories.has(code.id));
  }, [codes, codeCategories, categories]);

  const unthemedCategories = useMemo(() => {
    const assigned = new Set(categoryThemes.map((item) => item.category_id));
    return categories.filter((category) => !assigned.has(category.id));
  }, [categories, categoryThemes]);

  const categoriesByParent = useMemo(() => {
    const mapping: Record<string, Category[]> = {};
    categories.forEach((category) => {
      const parentKey = category.parent_category_id || "root";
      if (!mapping[parentKey]) mapping[parentKey] = [];
      mapping[parentKey].push(category);
    });
    Object.values(mapping).forEach((items) => items.sort((a, b) => a.name.localeCompare(b.name)));
    return mapping;
  }, [categories]);

  const rootCategories = useMemo(() => categoriesByParent.root || [], [categoriesByParent]);

  const getDescendantCategoryIds = useCallback((categoryId: string): string[] => {
    const stack = [...((categoriesByParent[categoryId] || []).map((category) => category.id))];
    const ids: string[] = [];

    while (stack.length > 0) {
      const currentId = stack.pop()!;
      ids.push(currentId);
      stack.push(...((categoriesByParent[currentId] || []).map((category) => category.id)));
    }

    return ids;
  }, [categoriesByParent]);

  const getCategoryAggregate = useCallback((categoryId: string) => {
    const rootCategory = categories.find((category) => category.id === categoryId);
    const descendantIds = [categoryId, ...getDescendantCategoryIds(categoryId)];
    const relevantCategoryIds = new Set(descendantIds);
    const relatedCodeIds = Array.from(new Set(
      codeCategories
        .filter((item) => relevantCategoryIds.has(item.category_id))
        .map((item) => item.code_id),
    ));
    if (rootCategory?.source_code_id) {
      relatedCodeIds.unshift(rootCategory.source_code_id);
    }
    const relatedCodes = relatedCodeIds
      .map((codeId) => codes.find((code) => code.id === codeId))
      .filter(Boolean) as Code[];

    let references = 0;
    const interviews = new Set<string>();
    relatedCodeIds.forEach((codeId) => {
      const stats = projectCodeStats[codeId];
      if (!stats) return;
      references += stats.uses;
      stats.interviews.forEach((interviewId) => interviews.add(interviewId));
    });

    return { relatedCodes, references, interviews, childCount: (categoriesByParent[categoryId] || []).length };
  }, [getDescendantCategoryIds, codeCategories, codes, projectCodeStats, categoriesByParent, categories]);

  const createCategory = async () => {
    if (!projectId || !newCategoryName.trim()) return;
    const { error } = await supabase.from("categories" as any).insert({
      project_id: projectId,
      name: newCategoryName.trim(),
      created_by: currentUserId,
      parent_category_id: null,
    });
    if (error) {
      toast.error(error.message || "Failed to create category");
      return;
    }
    setNewCategoryName("");
    toast.success("Category created");
    loadData();
  };

  const createCategoryFromCode = async (targetCodeId: string, draggedCodeId: string) => {
    if (!projectId || targetCodeId === draggedCodeId) return;

    const targetCode = codes.find((code) => code.id === targetCodeId);
    if (!targetCode) return;

    const existingCategory = categories.find((category) => category.source_code_id === targetCodeId);

    let categoryId = existingCategory?.id;

    if (!categoryId) {
      const { data, error } = await supabase
        .from("categories" as any)
        .insert({
          project_id: projectId,
          name: targetCode.label,
          color: targetCode.color,
          created_by: currentUserId,
          parent_category_id: null,
          source_code_id: targetCodeId,
        })
        .select()
        .single();

      if (error) {
        toast.error(error.message || "Failed to create category from code");
        return;
      }

      categoryId = data.id;
    }

    await assignCodeToCategory(draggedCodeId, categoryId, { silent: true, skipReload: true });
    setExpandedCategoryIds((current) => current.includes(categoryId!) ? current : [...current, categoryId!]);
    toast.success(`Converted "${targetCode.label}" into a category`);
    loadData();
  };

  const toggleCategoryExpanded = (categoryId: string) => {
    setExpandedCategoryIds((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId],
    );
  };

  const assignCategoryToParent = async (categoryId: string, parentCategoryId: string | null) => {
    if (categoryId === parentCategoryId) {
      toast.error("A category cannot be nested inside itself");
      return;
    }

    if (parentCategoryId) {
      const descendantIds = getDescendantCategoryIds(categoryId);
      if (descendantIds.includes(parentCategoryId)) {
        toast.error("A category cannot be moved inside one of its children");
        return;
      }
    }

    const { error } = await supabase
      .from("categories" as any)
      .update({ parent_category_id: parentCategoryId })
      .eq("id", categoryId);

    if (error) {
      toast.error(error.message || "Failed to update category hierarchy");
      return;
    }

    toast.success(parentCategoryId ? "Category nested successfully" : "Category moved to top level");
    if (parentCategoryId) {
      setExpandedCategoryIds((current) => current.includes(parentCategoryId) ? current : [...current, parentCategoryId]);
    }
    loadData();
  };

  const createTheme = async () => {
    if (!projectId || !newThemeName.trim()) return;
    const { error } = await supabase.from("themes" as any).insert({
      project_id: projectId,
      name: newThemeName.trim(),
      created_by: currentUserId,
    });
    if (error) {
      toast.error(error.message || "Failed to create theme");
      return;
    }
    setNewThemeName("");
    toast.success("Theme created");
    loadData();
  };

  const assignCodeToCategory = async (codeId: string, categoryId: string, options?: { silent?: boolean; skipReload?: boolean }) => {
    if (!projectId) return;
    const exists = codeCategories.some((item) => item.code_id === codeId && item.category_id === categoryId);
    if (exists) return;
    const { error: deleteError } = await supabase.from("code_categories" as any).delete().eq("code_id", codeId);
    if (deleteError) {
      toast.error(deleteError.message || "Failed to move code");
      return;
    }
    const { error } = await supabase.from("code_categories" as any).insert({
      project_id: projectId,
      code_id: codeId,
      category_id: categoryId,
      created_by: currentUserId,
    });
    if (error) {
      toast.error(error.message || "Failed to assign code");
      return;
    }
    setExpandedCategoryIds((current) => current.includes(categoryId) ? current : [...current, categoryId]);
    if (!options?.silent) toast.success("Code added to category");
    if (!options?.skipReload) loadData();
  };

  const assignCategoryToTheme = async (categoryId: string, themeId: string) => {
    if (!projectId) return;
    const exists = categoryThemes.some((item) => item.category_id === categoryId && item.theme_id === themeId);
    if (exists) return;
    const { error } = await supabase.from("category_themes" as any).insert({
      project_id: projectId,
      category_id: categoryId,
      theme_id: themeId,
      created_by: currentUserId,
    });
    if (error) {
      toast.error(error.message || "Failed to assign category");
      return;
    }
    toast.success("Category added to theme");
    loadData();
  };

  const removeCodeFromCategory = async (codeId: string, categoryId: string) => {
    const { error } = await supabase.from("code_categories" as any).delete().eq("code_id", codeId).eq("category_id", categoryId);
    if (error) {
      toast.error(error.message || "Failed to remove code");
      return;
    }
    loadData();
  };

  const removeCategoryFromTheme = async (categoryId: string, themeId: string) => {
    const { error } = await supabase.from("category_themes" as any).delete().eq("category_id", categoryId).eq("theme_id", themeId);
    if (error) {
      toast.error(error.message || "Failed to remove category");
      return;
    }
    loadData();
  };

  const onCodeDragStart = (e: React.DragEvent, codeId: string) => {
    e.dataTransfer.setData("text/qualcode-code", codeId);
    e.dataTransfer.effectAllowed = "move";
  };

  const onCategoryDragStart = (e: React.DragEvent, categoryId: string) => {
    e.dataTransfer.setData("text/qualcode-category", categoryId);
    e.dataTransfer.effectAllowed = "move";
  };

  const allowDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const renderCategoryBranch = (category: Category, depth = 0): React.ReactNode => {
    const aggregate = getCategoryAggregate(category.id);
    const categoryCodeIds = codeIdsByCategory[category.id] || [];
    const categoryCodes = categoryCodeIds.map((codeId) => codes.find((code) => code.id === codeId)).filter(Boolean) as Code[];
    const childCategories = categoriesByParent[category.id] || [];
    const isExpanded = expandedCategoryIds.includes(category.id);

    return (
      <div key={category.id}>
        <div
          className={`grid grid-cols-[minmax(0,1fr)_88px_96px] items-center border-b border-border px-3 py-2 text-sm hover:bg-secondary/20 ${depth > 0 ? "bg-secondary/10" : ""}`}
          onDragOver={allowDrop}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const codeId = e.dataTransfer.getData("text/qualcode-code");
            const draggedCategoryId = e.dataTransfer.getData("text/qualcode-category");
            if (codeId) assignCodeToCategory(codeId, category.id);
            if (draggedCategoryId) assignCategoryToParent(draggedCategoryId, category.id);
          }}
        >
          <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${depth * 18}px` }}>
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-secondary"
              onClick={() => toggleCategoryExpanded(category.id)}
            >
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
            <div
              draggable
              onDragStart={(e) => onCategoryDragStart(e, category.id)}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: category.color || "hsl(var(--muted))" }} />
              <span className="truncate font-medium text-foreground">{category.name}</span>
            </div>
          </div>
          <span className="text-right font-mono text-xs text-muted-foreground">{aggregate.interviews.size}</span>
          <span className="text-right font-mono text-xs text-muted-foreground">{aggregate.references}</span>
        </div>

        {isExpanded && (
          <>
            {categoryCodes.map((code) => (
              <div
                key={code.id}
                draggable
                onDragStart={(e) => onCodeDragStart(e, code.id)}
                className="grid grid-cols-[minmax(0,1fr)_88px_96px] items-center border-b border-border bg-background px-3 py-2 text-sm"
                style={{ borderLeft: `4px solid ${getCodeAccent(code.color)}` }}
              >
                <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: `${(depth + 1) * 18 + 22}px` }}>
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: getCodeAccent(code.color) }} />
                  <span className="truncate text-foreground">{code.label}</span>
                </div>
                <span className="text-right font-mono text-xs text-muted-foreground">{projectCodeStats[code.id]?.interviews.size || 0}</span>
                <div className="flex items-center justify-end gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{projectCodeStats[code.id]?.uses || 0}</span>
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={() => removeCodeFromCategory(code.id, category.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {childCategories.map((childCategory) => renderCategoryBranch(childCategory, depth + 1))}
          </>
        )}
      </div>
    );
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-muted-foreground">Loading workspace…</p></div>;
  if (!transcript) return <div className="flex min-h-screen items-center justify-center bg-background"><p className="text-muted-foreground">Transcript not found.</p></div>;

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card px-5 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/project/${projectId}/transcripts`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="font-body text-sm font-semibold text-foreground tracking-wide-sm">Coding Workspace</h1>
            <span className="text-muted-foreground">·</span>
            <span className="text-sm text-muted-foreground">{transcript.participant_pseudonym}</span>
          </div>
        </div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Transcript panel */}
        <ResizablePanel defaultSize={60} minSize={40}>
          <ScrollArea className="h-full">
            <div className="p-8">
              <div className="mb-4 flex items-center justify-end gap-2">
                <div className="mr-auto flex items-center gap-2">
                  <Button variant={selectionMode === "code" ? "default" : "outline"} size="sm" onClick={() => setSelectionMode("code")} className="gap-1.5">
                    <Highlighter className="h-3.5 w-3.5" />
                    Code
                  </Button>
                  <Button variant={selectionMode === "note" ? "default" : "outline"} size="sm" onClick={() => setSelectionMode("note")} className="gap-1.5">
                    <StickyNote className="h-3.5 w-3.5" />
                    Note
                  </Button>
                </div>
                <Button variant="outline" size="sm" onClick={() => setFontScale((size) => Math.max(12, size - 1))}>A-</Button>
                <span className="min-w-[48px] text-center font-mono text-[11px] text-muted-foreground">{fontScale}px</span>
                <Button variant="outline" size="sm" onClick={() => setFontScale((size) => Math.min(20, size + 1))}>A+</Button>
              </div>
              <div
                ref={contentRef}
                className="whitespace-pre-wrap font-body leading-[1.8] text-foreground selection:bg-primary/20"
                style={{ fontSize: `${fontScale}px` }}
                onMouseUp={handleMouseUp}
              >
                {renderedTranscript}
              </div>
            </div>

            {/* Floating popover */}
            {popoverOpen && popoverPos && (
              <div ref={popoverRef} className="fixed z-50" style={{ left: Math.max(10, popoverPos.x - 170), top: Math.max(10, popoverPos.y - (aiSuggestions.length > 0 ? 560 : 360)) }}>
                <div className="w-[320px] rounded-lg border border-primary/20 bg-card p-4 shadow-lg shadow-primary/5">
                  <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{selectionMode === "code" ? "Apply code to selection" : "Add note to selection"}</p>
                  {selectionMode === "code" ? (
                    <div className="space-y-3">
                      <Input placeholder="New code name..." value={newCodeLabel} onChange={(e) => setNewCodeLabel(e.target.value)} className="h-8 text-sm" />
                      {theories.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Theory for new code</p>
                          <Select value={newCodeTheoryId} onValueChange={setNewCodeTheoryId}>
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Optional theory link" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No theory</SelectItem>
                              {theories.map((theory) => (
                                <SelectItem key={theory.id} value={theory.id}>
                                  <span className="flex items-center gap-2">
                                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: theory.color }} />
                                    {theory.name}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="rounded-md border border-border bg-secondary/20">
                        <div className="border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          Existing codes for this selection
                        </div>
                        <ScrollArea className="h-[132px]">
                          <div className="space-y-1 p-2">
                            {codes.length === 0 ? (
                              <p className="px-2 py-3 text-xs text-muted-foreground">No existing codes in this project yet.</p>
                            ) : codes.map((code) => (
                              <label key={code.id} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-secondary">
                                <Checkbox
                                  checked={selectedCodeIds.includes(code.id)}
                                  onCheckedChange={(checked) => toggleCodeSelection(code.id, checked === true)}
                                />
                                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: getCodeAccent(code.color) }} />
                                <span className="flex-1 truncate">{code.label}</span>
                                <span className="font-mono text-[10px] text-muted-foreground">{codeFrequency[code.id] || 0}</span>
                              </label>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" className="flex-1" onClick={() => { setPopoverOpen(false); setSelection(null); setAiSuggestions([]); setSelectedCodeIds([]); window.getSelection()?.removeAllRanges(); }}>Cancel</Button>
                        <Button size="sm" variant="outline" className="gap-1" onClick={askAI} disabled={aiLoading}>
                          {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                          Ask AI
                        </Button>
                        <Button size="sm" className="flex-1" onClick={() => applyCode()}>Apply</Button>
                      </div>

                      {selection && (
                        <button
                          onClick={applyInVivo}
                          className="w-full rounded-md border border-primary/50 bg-transparent px-3 py-2 text-left transition-colors hover:bg-primary/10"
                        >
                          <div className="flex items-center gap-2">
                            <Quote className="h-3.5 w-3.5 shrink-0 text-primary" />
                            <span className="text-sm font-medium text-primary">Use exact words</span>
                          </div>
                          <p className="mt-1 font-mono text-[11px] text-muted-foreground truncate">
                            "{truncatePreview(selection.text, 40)}"
                          </p>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-md bg-secondary/20 px-3 py-2 text-xs text-muted-foreground">
                        {selection ? `"${truncatePreview(selection.text, 80)}"` : "No text selected"}
                      </div>
                      <textarea
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        rows={4}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder='Add an analytical note, for example: "This question connects to Dynamic Capabilities."'
                      />
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" className="flex-1" onClick={() => { setPopoverOpen(false); setSelection(null); setNoteDraft(""); window.getSelection()?.removeAllRanges(); }}>Cancel</Button>
                        <Button size="sm" className="flex-1" onClick={saveNote} disabled={!noteDraft.trim()}>Save Note</Button>
                      </div>
                    </div>
                  )}

                  {aiSuggestions.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-border pt-3">
                      <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">AI Suggestions</p>
                        {aiSuggestions.map((s, i) => (
                        <button
                          key={i}
                          className="w-full rounded-sm border border-border bg-secondary/50 p-2.5 text-left transition-colors hover:bg-secondary"
                          onClick={() => { setNewCodeLabel(s.label); }}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-foreground">{s.label}</span>
                            <Badge variant="outline" className={`${confidenceBadge[s.confidence]}`}>{s.confidence}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">{s.justification}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  {aiLoading && (
                    <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Analyzing segment…</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </ScrollArea>
        </ResizablePanel>

        <ResizableHandle />

        {/* Codes panel */}
        <ResizablePanel defaultSize={40} minSize={25}>
          <div className="flex h-full flex-col border-l border-border bg-card">
            <div className="border-b border-border px-6 py-4">
              <h2 className="font-body text-sm font-semibold text-foreground">Codes</h2>
              <p className="font-mono text-[10px] text-muted-foreground mt-0.5">{codes.length} codes · {categories.length} categories · {themes.length} themes</p>
            </div>
            <Tabs value={analysisTab} onValueChange={setAnalysisTab} className="flex flex-1 flex-col overflow-hidden">
              <div className="border-b border-border px-3 py-2">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="codes">Codes</TabsTrigger>
                  <TabsTrigger value="categories">Categories</TabsTrigger>
                  <TabsTrigger value="themes">Themes</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="codes" className="mt-0 flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="p-3 space-y-3">
                    {codes.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-8 text-center">No codes yet. Select text to create your first code.</p>
                    ) : (
                      <div className="overflow-hidden rounded-lg border border-border bg-background">
                        <div className="grid grid-cols-[minmax(0,1fr)_88px_88px_96px] border-b border-border bg-secondary/20 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          <span>Name</span>
                          <span className="text-right">Origin</span>
                          <span className="text-right">Interviews</span>
                          <span className="text-right">References</span>
                        </div>
                        {codes.map((code) => {
                          const badge = originBadgeStyles[code.origin || "researcher"];
                          const stats = projectCodeStats[code.id];
                          const interviewCount = stats?.interviews.size || 0;
                          const useCount = stats?.uses || 0;
                          return (
                            <button
                              key={code.id}
                              onClick={() => {
                                if (selectedCodeFocusId === code.id) {
                                  setSelectedCodeFocusId(null);
                                  return;
                                }
                                setSelectedCodeFocusId(code.id);
                                scrollToCode(code.id);
                              }}
                              className={`grid w-full grid-cols-[minmax(0,1fr)_88px_88px_96px] items-center border-b border-border px-3 py-2 text-left text-sm transition-colors last:border-b-0 hover:bg-secondary/30 ${selectedCodeFocusId === code.id ? "bg-secondary/40" : ""}`}
                              style={{ borderLeft: `4px solid ${getCodeAccent(code.color)}` }}
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: getCodeAccent(code.color) }} />
                                <span className="truncate text-foreground font-body">{code.label}</span>
                              </span>
                              <span className="flex justify-end">
                                {badge ? (
                                  <span className={`shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase leading-none ${badge.className}`}>
                                    {badge.label}
                                  </span>
                                ) : (
                                  <span className="font-mono text-xs text-muted-foreground">RESEARCHER</span>
                                )}
                              </span>
                              <span className="text-right font-mono text-xs text-muted-foreground">{interviewCount}</span>
                              <span className="text-right font-mono text-xs text-muted-foreground">{useCount}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {selectedCodeFocusId && (
                      <div className="mt-4 rounded-lg border border-border bg-card p-3">
                        <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Code summary</p>
                        {(() => {
                          const code = codes.find((item) => item.id === selectedCodeFocusId);
                          const stats = code ? projectCodeStats[code.id] : null;
                          if (!code || !stats) {
                            return <p className="text-sm text-muted-foreground">No project-wide evidence for this code yet.</p>;
                          }

                          return (
                            <div className="space-y-3">
                              <div>
                                <p className="text-sm font-medium text-foreground">{code.label}</p>
                                <p className="text-xs text-muted-foreground">{stats.uses} references across {stats.interviews.size} interviews</p>
                              </div>
                              {Object.entries(stats.byTranscript).map(([transcriptId, transcriptApps]) => (
                                <div key={transcriptId} className="rounded-md bg-secondary/20 p-3">
                                  <p className="mb-2 text-sm font-medium text-foreground">{transcriptApps[0]?.transcript?.participant_pseudonym || "Transcript"}</p>
                                  <div className="space-y-2">
                                    {transcriptApps.slice(0, 3).map((app) => (
                                      <div key={app.id} className="rounded-sm bg-background px-2 py-2 text-xs text-foreground">
                                        {app.segment_text}
                                      </div>
                                    ))}
                                    {transcriptApps.length > 3 && (
                                      <p className="text-[11px] text-muted-foreground">+{transcriptApps.length - 3} more excerpts in this interview</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="categories" className="mt-0 flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="space-y-4 p-3">
                    <div className="rounded-lg border border-border bg-secondary/20 p-3">
                      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Create category</p>
                      <div className="flex gap-2">
                        <Input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="New category name" className="h-9 text-sm" />
                        <Button size="sm" onClick={createCategory} disabled={!newCategoryName.trim()}>Create</Button>
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <FolderTree className="h-4 w-4 text-muted-foreground" />
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Uncategorized codes</p>
                      </div>
                      <div className="space-y-2">
                        {uncategorizedCodes.length === 0 ? (
                          <div className="rounded-md bg-secondary/20 px-3 py-3 text-sm text-muted-foreground">All current codes are already organized into categories.</div>
                        ) : uncategorizedCodes.map((code) => (
                          <div
                            key={code.id}
                            draggable
                            onDragStart={(e) => onCodeDragStart(e, code.id)}
                            onDragOver={allowDrop}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const draggedCodeId = e.dataTransfer.getData("text/qualcode-code");
                              if (draggedCodeId) createCategoryFromCode(code.id, draggedCodeId);
                            }}
                            className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm"
                            style={{ borderLeft: `4px solid ${getCodeAccent(code.color)}` }}
                          >
                            <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: getCodeAccent(code.color) }} />
                            <span className="flex-1 truncate">{code.label}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">{projectCodeStats[code.id]?.uses || 0} ref.</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      {categories.length === 0 ? (
                        <div className="rounded-md bg-secondary/20 px-3 py-4 text-sm text-muted-foreground">No categories yet. Create one, then drag codes into it.</div>
                      ) : (
                        <>
                          <div
                            className="rounded-md border border-dashed border-border bg-secondary/20 px-3 py-2 text-xs text-muted-foreground"
                            onDragOver={allowDrop}
                            onDrop={(e) => {
                              e.preventDefault();
                              const categoryId = e.dataTransfer.getData("text/qualcode-category");
                              if (categoryId) assignCategoryToParent(categoryId, null);
                            }}
                          >
                            Drop a category here to move it back to the top level.
                          </div>
                          <div className="overflow-hidden rounded-lg border border-border bg-background">
                            <div className="grid grid-cols-[minmax(0,1fr)_88px_96px] border-b border-border bg-secondary/20 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                              <span>Name</span>
                              <span className="text-right">Interviews</span>
                              <span className="text-right">References</span>
                            </div>
                            <div className="space-y-3 p-3">
                              {rootCategories.map((category) => renderCategoryBranch(category))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="themes" className="mt-0 flex-1 overflow-hidden">
                <ScrollArea className="h-full">
                  <div className="space-y-4 p-3">
                    <div className="rounded-lg border border-border bg-secondary/20 p-3">
                      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Create theme</p>
                      <div className="flex gap-2">
                        <Input value={newThemeName} onChange={(e) => setNewThemeName(e.target.value)} placeholder="New theme name" className="h-9 text-sm" />
                        <Button size="sm" onClick={createTheme} disabled={!newThemeName.trim()}>Create</Button>
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <Layers3 className="h-4 w-4 text-muted-foreground" />
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Available categories</p>
                      </div>
                      <div className="space-y-2">
                        {unthemedCategories.length === 0 ? (
                          <div className="rounded-md bg-secondary/20 px-3 py-3 text-sm text-muted-foreground">All categories are already organized into themes.</div>
                        ) : unthemedCategories.map((category) => {
                          const relatedCodes = codeIdsByCategory[category.id] || [];
                          return (
                            <div
                              key={category.id}
                              draggable
                              onDragStart={(e) => onCategoryDragStart(e, category.id)}
                              className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm"
                            >
                              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: category.color || "hsl(var(--primary))" }} />
                              <span className="flex-1 truncate">{category.name}</span>
                              <span className="font-mono text-[10px] text-muted-foreground">{relatedCodes.length} codes</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-3">
                      {themes.length === 0 ? (
                        <div className="rounded-md bg-secondary/20 px-3 py-4 text-sm text-muted-foreground">No themes yet. Create one, then drag categories into it.</div>
                      ) : themes.map((theme) => {
                        const themeCategoryIds = categoryIdsByTheme[theme.id] || [];
                        const themeCategories = themeCategoryIds.map((categoryId) => categories.find((category) => category.id === categoryId)).filter(Boolean) as Category[];
                        return (
                          <div
                            key={theme.id}
                            onDragOver={allowDrop}
                            onDrop={(e) => {
                              e.preventDefault();
                              const categoryId = e.dataTransfer.getData("text/qualcode-category");
                              if (categoryId) assignCategoryToTheme(categoryId, theme.id);
                            }}
                            className="rounded-lg border border-border bg-card p-3 shadow-sm"
                          >
                            <div className="mb-2 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: theme.color || "#4C6FFF" }} />
                                <span className="text-sm font-medium text-foreground">{theme.name}</span>
                              </div>
                              <span className="font-mono text-[10px] text-muted-foreground">{themeCategories.length} categories</span>
                            </div>
                            <div className="space-y-2">
                              {themeCategories.length === 0 ? (
                                <div className="rounded-md bg-secondary/20 px-3 py-2 text-xs text-muted-foreground">Drop categories here</div>
                              ) : themeCategories.map((category) => {
                                const relatedCodes = codeIdsByCategory[category.id] || [];
                                return (
                                  <div key={category.id} className="rounded-md bg-secondary/20 px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: category.color || "hsl(var(--primary))" }} />
                                      <span className="flex-1 truncate text-sm">{category.name}</span>
                                      <span className="font-mono text-[10px] text-muted-foreground">{relatedCodes.length} codes</span>
                                      <button
                                        type="button"
                                        className="text-[11px] text-muted-foreground hover:text-foreground"
                                        onClick={() => removeCategoryFromTheme(category.id, theme.id)}
                                      >
                                        Remove
                                      </button>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                      {relatedCodes.slice(0, 6).map((codeId) => {
                                        const code = codes.find((item) => item.id === codeId);
                                        if (!code) return null;
                                        return (
                                          <span key={code.id} className="rounded-sm bg-background px-2 py-1 text-[11px] text-muted-foreground">
                                            {code.label}
                                          </span>
                                        );
                                      })}
                                      {relatedCodes.length > 6 && (
                                        <span className="rounded-sm bg-background px-2 py-1 text-[11px] text-muted-foreground">+{relatedCodes.length - 6} more</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* In Vivo educational tooltip */}
      {showInVivoTooltip && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="w-[360px] rounded-md border border-primary/50 bg-popover p-6 shadow-xl">
            <h3 className="text-sm font-semibold text-foreground mb-2">In vivo code applied</h3>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              In vivo codes use the participant's exact words as the label.
              They preserve the participant's voice and often capture
              something a paraphrase would lose.
              Use them alongside your own interpretive codes —
              not as a replacement for analysis.
            </p>
            <Button
              size="sm"
              className="w-full"
              onClick={() => {
                localStorage.setItem("invivo_tooltip_seen", "true");
                setShowInVivoTooltip(false);
              }}
            >
              Got it
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CodingWorkspace;
