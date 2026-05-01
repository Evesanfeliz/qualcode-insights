import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, ArrowLeft, BookMarked, BookOpen, Check, FileText, Layers3, Lightbulb, Loader2, Network, Sparkles, StickyNote, X } from "lucide-react";
import { toast } from "sonner";

type ProjectSnapshot = {
  title: string;
  research_question: string | null;
  domain_framework: string | null;
  approach: string | null;
  reasoning_mode: string | null;
};

type EntitlementSnapshot = {
  interview_credits_purchased: number;
  interview_credits_used: number;
  free_trial_interviews_used: number;
  max_minutes_per_paid_interview: number;
  max_minutes_free_trial: number;
  status: string;
} | null;

type TranscriptSummary = {
  id: string;
  participant_code: string | null;
  participant_pseudonym: string;
  word_count: number | null;
};

type TranscriptDetail = TranscriptSummary & {
  content: string;
};

type RunRecord = {
  id: string;
  stage: "initial" | "focused" | "themes";
  status: string;
  transcript_id: string | null;
  created_at: string;
};

type UsageRecord = {
  id: string;
  transcript_id: string;
  usage_type: "free_trial" | "paid";
  credit_cost: number;
  interview_minutes: number | null;
  max_minutes_allowed: number | null;
  status: "reserved" | "completed" | "cancelled";
};

type Stage1Evidence = {
  id: string;
  transcript_excerpt: string;
  start_index: number | null;
  end_index: number | null;
  participant_pseudonym: string | null;
};

type Stage1Item = {
  id: string;
  label: string;
  description: string | null;
  rationale: string | null;
  review_status: "draft" | "accepted" | "edited" | "rejected" | "skipped";
  accepted_target_id: string | null;
  evidence: Stage1Evidence[];
};

type AcceptedInitialCode = {
  item_id: string;
  code_id: string | null;
  transcript_id: string | null;
  label: string;
  description: string | null;
  evidence_quotes: string[];
  participant_labels: string[];
};

type FocusedGroupItem = {
  id: string;
  label: string;
  description: string | null;
  rationale: string | null;
  review_status: "draft" | "accepted" | "edited" | "rejected" | "skipped";
  accepted_target_id: string | null;
  evidence: Stage1Evidence[];
  member_item_ids: string[];
  member_code_ids: string[];
  member_labels: string[];
};

type AcceptedFocusedGroup = {
  item_id: string;
  category_id: string | null;
  label: string;
  description: string | null;
  member_labels: string[];
  evidence_quotes: string[];
};

type ThemeSuggestionItem = {
  id: string;
  label: string;
  description: string | null;
  rationale: string | null;
  review_status: "draft" | "accepted" | "edited" | "rejected" | "skipped";
  accepted_target_id: string | null;
  evidence: Stage1Evidence[];
  member_item_ids: string[];
  member_category_ids: string[];
  member_labels: string[];
  subthemes: Array<{
    name: string;
    description?: string | null;
  }>;
};

type GenerationSuggestion = {
  label: string;
  description?: string;
  rationale?: string;
  evidence?: Array<{
    quote: string;
    why_it_matters?: string;
  }>;
};

type UsageDecision =
  | { eligible: true; usageType: "free_trial" | "paid"; creditCost: number; interviewMinutes: number; maxMinutesAllowed: number }
  | { eligible: false; reason: string };

const WORDS_PER_MINUTE = 160;
const AI_TEST_MODE = true;

const toReadableDate = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const estimateMinutes = (wordCount: number | null) => {
  if (!wordCount || wordCount <= 0) return 1;
  return Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));
};

const normalizeLabel = (value: string) => value.trim().replace(/\s+/g, " ");

const findQuoteSpan = (content: string, quote: string, startAt = 0) => {
  const normalizedQuote = quote.trim();
  if (!normalizedQuote) return null;
  const directIndex = content.indexOf(normalizedQuote, startAt);
  if (directIndex !== -1) {
    return { start: directIndex, end: directIndex + normalizedQuote.length };
  }

  const compactQuote = normalizedQuote.replace(/\s+/g, " ").trim();
  if (!compactQuote) return null;
  const compactContent = content.replace(/\s+/g, " ");
  const compactIndex = compactContent.indexOf(compactQuote);
  if (compactIndex === -1) return null;

  const candidate = content.indexOf(compactQuote);
  if (candidate === -1) return null;
  return { start: candidate, end: candidate + compactQuote.length };
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return String(error ?? "");
};

const isMissingAiFoundation = (error: unknown) => {
  const message = getErrorMessage(error);
  return (
    message.includes("schema cache") ||
    message.includes("Could not find the table 'public.project_ai_entitlements'") ||
    message.includes("Could not find the table 'public.ai_analysis_runs'") ||
    message.includes("relation \"public.project_ai_entitlements\" does not exist") ||
    message.includes("relation \"public.ai_analysis_runs\" does not exist") ||
    message.includes("relation \"public.ai_analysis_items\" does not exist")
  );
};

const isAuthTokenError = (error: unknown) => {
  const message = getErrorMessage(error);
  return (
    message.includes("Invalid JWT") ||
    message.includes("JWT") ||
    message.includes("Missing authorization header") ||
    message.includes("Invalid Token")
  );
};

const getFunctionErrorMessage = async (
  error: unknown,
  fallback: string,
  response?: Response,
) => {
  const directMessage = getErrorMessage(error);
  if (directMessage && directMessage !== "Edge Function returned a non-2xx status code") {
    return directMessage;
  }

  if (!response) return fallback;

  try {
    const cloned = response.clone();
    const contentType = cloned.headers.get("Content-Type") || "";
    if (contentType.includes("application/json")) {
      const payload = await cloned.json();
      if (payload?.error && typeof payload.error === "string") return payload.error;
      if (payload?.message && typeof payload.message === "string") return payload.message;
    }

    const text = (await cloned.text()).trim();
    return text || fallback;
  } catch {
    return fallback;
  }
};

const AIAnalysis = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<"initial" | "focused" | "themes">("initial");
  const [aiFoundationReady, setAiFoundationReady] = useState(true);
  const [project, setProject] = useState<ProjectSnapshot | null>(null);
  const [entitlement, setEntitlement] = useState<EntitlementSnapshot>(null);
  const [transcripts, setTranscripts] = useState<TranscriptSummary[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [usageRecords, setUsageRecords] = useState<UsageRecord[]>([]);

  const [selectedTranscriptId, setSelectedTranscriptId] = useState<string | null>(null);
  const [selectedTranscript, setSelectedTranscript] = useState<TranscriptDetail | null>(null);
  const [selectedRun, setSelectedRun] = useState<RunRecord | null>(null);
  const [stage1Items, setStage1Items] = useState<Stage1Item[]>([]);
  const [acceptedStage1History, setAcceptedStage1History] = useState<Stage1Item[]>([]);
  const [editedLabels, setEditedLabels] = useState<Record<string, string>>({});
  const [acceptedInitialCodes, setAcceptedInitialCodes] = useState<AcceptedInitialCode[]>([]);
  const [focusedRun, setFocusedRun] = useState<RunRecord | null>(null);
  const [focusedItems, setFocusedItems] = useState<FocusedGroupItem[]>([]);
  const [focusedEditedLabels, setFocusedEditedLabels] = useState<Record<string, string>>({});
  const [initialPendingCount, setInitialPendingCount] = useState(0);
  const [acceptedFocusedGroups, setAcceptedFocusedGroups] = useState<AcceptedFocusedGroup[]>([]);
  const [themeRun, setThemeRun] = useState<RunRecord | null>(null);
  const [themeItems, setThemeItems] = useState<ThemeSuggestionItem[]>([]);
  const [themeEditedLabels, setThemeEditedLabels] = useState<Record<string, string>>({});
  const [focusedPendingCount, setFocusedPendingCount] = useState(0);

  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [focusedLoading, setFocusedLoading] = useState(false);
  const [generatingFocused, setGeneratingFocused] = useState(false);
  const [updatingFocusedItemId, setUpdatingFocusedItemId] = useState<string | null>(null);
  const [themesLoading, setThemesLoading] = useState(false);
  const [generatingThemes, setGeneratingThemes] = useState(false);
  const [updatingThemeItemId, setUpdatingThemeItemId] = useState<string | null>(null);
  const [highlightStage1Review, setHighlightStage1Review] = useState(false);
  const [highlightFocusedReview, setHighlightFocusedReview] = useState(false);
  const [highlightThemeReview, setHighlightThemeReview] = useState(false);
  const stage1ReviewRef = useRef<HTMLElement | null>(null);
  const focusedReviewRef = useRef<HTMLElement | null>(null);
  const themeReviewRef = useRef<HTMLElement | null>(null);

  const ensureFreshSession = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      throw new Error("No active session");
    }

    const expiresAt = data.session.expires_at ? data.session.expires_at * 1000 : 0;
    const shouldRefresh = !expiresAt || expiresAt - Date.now() < 60_000;
    if (!shouldRefresh) return data.session;

    const refreshResult = await supabase.auth.refreshSession();
    if (refreshResult.error) throw refreshResult.error;
    if (!refreshResult.data.session) throw new Error("No active session");
    return refreshResult.data.session;
  }, []);

  const invokeFunctionWithRetry = useCallback(async <T,>(name: string, body: Record<string, unknown>) => {
    let session = await ensureFreshSession();
    let result = await supabase.functions.invoke<T>(name, {
      body,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    });
    if (!result || typeof result !== "object") {
      throw new Error(`Function ${name} did not return a valid response.`);
    }

    if ("error" in result && result.error && isAuthTokenError(result.error)) {
      const refreshResult = await supabase.auth.refreshSession();
      if (refreshResult.error) throw refreshResult.error;
      if (!refreshResult.data.session) throw new Error("No active session");
      session = refreshResult.data.session;
      result = await supabase.functions.invoke<T>(name, {
        body,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      if (!result || typeof result !== "object") {
        throw new Error(`Function ${name} did not return a valid response.`);
      }
    }
    return result;
  }, [ensureFreshSession]);

  const handleAuthFailure = useCallback(async () => {
    await supabase.auth.signOut();
    toast.error("Your session expired. Please sign in again.");
    navigate("/auth");
  }, [navigate]);

  const revealStage1Review = useCallback(() => {
    setActiveStage("initial");
    setHighlightStage1Review(true);
    window.setTimeout(() => {
      stage1ReviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    window.setTimeout(() => setHighlightStage1Review(false), 2200);
  }, []);

  const revealFocusedReview = useCallback(() => {
    setActiveStage("focused");
    setHighlightFocusedReview(true);
    window.setTimeout(() => {
      focusedReviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    window.setTimeout(() => setHighlightFocusedReview(false), 2200);
  }, []);

  const revealThemeReview = useCallback(() => {
    setActiveStage("themes");
    setHighlightThemeReview(true);
    window.setTimeout(() => {
      themeReviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    window.setTimeout(() => setHighlightThemeReview(false), 2200);
  }, []);

  const loadOverview = useCallback(async () => {
    if (!projectId) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        navigate("/auth");
        return;
      }

      setCurrentUserId(sessionData.session.user.id);

      const [projectRes, transcriptsRes] = await Promise.all([
        supabase
          .from("projects")
          .select("title, research_question, domain_framework, approach, reasoning_mode")
          .eq("id", projectId)
          .single(),
        supabase
          .from("transcripts")
          .select("id, participant_code, participant_pseudonym, word_count")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false }),
      ]);

      if (projectRes.error) throw projectRes.error;
      if (transcriptsRes.error) throw transcriptsRes.error;

      const transcriptData = (transcriptsRes.data ?? []) as TranscriptSummary[];

      setProject(projectRes.data as ProjectSnapshot);
      setTranscripts(transcriptData);

      setSelectedTranscriptId((previous) => previous ?? transcriptData[0]?.id ?? null);
      setAiFoundationReady(true);

      const [entitlementRes, runsRes, usageRes, pendingInitialRes, pendingFocusedRes] = await Promise.allSettled([
        supabase
          .from("project_ai_entitlements" as any)
          .select("interview_credits_purchased, interview_credits_used, free_trial_interviews_used, max_minutes_per_paid_interview, max_minutes_free_trial, status")
          .eq("project_id", projectId)
          .maybeSingle(),
        supabase
          .from("ai_analysis_runs" as any)
          .select("id, stage, status, transcript_id, created_at")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false }),
        supabase
          .from("project_ai_interview_usage" as any)
          .select("id, transcript_id, usage_type, credit_cost, interview_minutes, max_minutes_allowed, status")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false }),
        supabase
          .from("ai_analysis_items" as any)
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId)
          .eq("item_type", "initial_code")
          .in("review_status", ["draft", "edited"]),
        supabase
          .from("ai_analysis_items" as any)
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId)
          .eq("item_type", "focused_group")
          .in("review_status", ["draft", "edited"]),
      ]);

      const aiResponses = [entitlementRes, runsRes, usageRes, pendingInitialRes, pendingFocusedRes];
      const aiFailure = aiResponses.find((result) => result.status === "rejected");
      if (aiFailure && isMissingAiFoundation(aiFailure.reason)) {
        setAiFoundationReady(false);
        setEntitlement(null);
        setRuns([]);
        setUsageRecords([]);
        setInitialPendingCount(0);
        setFocusedPendingCount(0);
        return;
      }

      const unpacked = aiResponses.map((result) => {
        if (result.status === "rejected") throw result.reason;
        return result.value;
      });

      const [entitlementValue, runsValue, usageValue, pendingValue, pendingFocusedValue] = unpacked;
      if (entitlementValue.error) throw entitlementValue.error;
      if (runsValue.error) throw runsValue.error;
      if (usageValue.error) throw usageValue.error;
      if (pendingValue.error) throw pendingValue.error;
      if (pendingFocusedValue.error) throw pendingFocusedValue.error;

      setEntitlement((entitlementValue.data ?? null) as EntitlementSnapshot);
      setRuns((runsValue.data ?? []) as RunRecord[]);
      setUsageRecords((usageValue.data ?? []) as UsageRecord[]);
      setInitialPendingCount(pendingValue.count ?? 0);
      setFocusedPendingCount(pendingFocusedValue.count ?? 0);
    } catch (error: any) {
      if (isMissingAiFoundation(error)) {
        setAiFoundationReady(false);
        setEntitlement(null);
        setRuns([]);
        setUsageRecords([]);
        setInitialPendingCount(0);
        setFocusedPendingCount(0);
      } else if (isAuthTokenError(error)) {
        await handleAuthFailure();
      } else {
        toast.error(error.message || "Failed to load AI analysis workspace");
      }
    } finally {
      setLoading(false);
    }
  }, [handleAuthFailure, navigate, projectId]);

  const loadTranscriptWorkspace = useCallback(async (transcriptId: string) => {
    if (!projectId) return;
    if (!aiFoundationReady) {
      setSelectedTranscript(null);
      setSelectedRun(null);
      setStage1Items([]);
      setAcceptedStage1History([]);
      setEditedLabels({});
      return;
    }

    setTranscriptLoading(true);
    try {
      const [transcriptRes, runsRes, acceptedHistoryRes] = await Promise.all([
        supabase
          .from("transcripts")
          .select("id, participant_code, participant_pseudonym, word_count, content")
          .eq("id", transcriptId)
          .single(),
        supabase
          .from("ai_analysis_runs" as any)
          .select("id, stage, status, transcript_id, created_at")
          .eq("project_id", projectId)
          .eq("transcript_id", transcriptId)
          .eq("stage", "initial")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("ai_analysis_items" as any)
          .select("id, label, description, rationale, review_status, accepted_target_id, run_id, order_index")
          .eq("project_id", projectId)
          .eq("transcript_id", transcriptId)
          .eq("item_type", "initial_code")
          .eq("review_status", "accepted")
          .order("updated_at", { ascending: false }),
      ]);

      if (transcriptRes.error) throw transcriptRes.error;
      if (runsRes.error) throw runsRes.error;
      if (acceptedHistoryRes.error) throw acceptedHistoryRes.error;

      setSelectedTranscript(transcriptRes.data as TranscriptDetail);

      const allRuns = (runsRes.data ?? []) as RunRecord[];

      if (allRuns.length === 0) {
        setSelectedRun(null);
        setStage1Items([]);
        setAcceptedStage1History([]);
        setEditedLabels({});
        return;
      }

      let chosenRun: RunRecord | null = null;
      let chosenItemsData: any[] = [];

      for (const run of allRuns) {
        const { data: runItemsData, error: runItemsError } = await supabase
          .from("ai_analysis_items" as any)
          .select("id, label, description, rationale, review_status, accepted_target_id")
          .eq("run_id", run.id)
          .order("order_index", { ascending: true });

        if (runItemsError) throw runItemsError;

        if ((runItemsData ?? []).length > 0) {
          chosenRun = run;
          chosenItemsData = runItemsData ?? [];
          break;
        }
      }

      const latestRun = chosenRun ?? allRuns[0] ?? null;
      setSelectedRun(latestRun);

      if (!latestRun) {
        setStage1Items([]);
        setAcceptedStage1History([]);
        setEditedLabels({});
        return;
      }

      const itemIds = chosenItemsData.map((item: any) => item.id);
      const acceptedHistoryIds = (acceptedHistoryRes.data ?? []).map((item: any) => item.id);
      const evidenceIds = Array.from(new Set([...itemIds, ...acceptedHistoryIds]));
      let evidenceMap = new Map<string, Stage1Evidence[]>();

      if (evidenceIds.length > 0) {
        const { data: evidenceData, error: evidenceError } = await supabase
          .from("ai_analysis_item_evidence" as any)
          .select("id, item_id, transcript_excerpt, start_index, end_index, participant_pseudonym")
          .in("item_id", evidenceIds);

        if (evidenceError) throw evidenceError;

        evidenceMap = (evidenceData ?? []).reduce((map: Map<string, Stage1Evidence[]>, row: any) => {
          const existing = map.get(row.item_id) ?? [];
          existing.push({
            id: row.id,
            transcript_excerpt: row.transcript_excerpt,
            start_index: row.start_index,
            end_index: row.end_index,
            participant_pseudonym: row.participant_pseudonym,
          });
          map.set(row.item_id, existing);
          return map;
        }, new Map<string, Stage1Evidence[]>());
      }

      const nextItems = chosenItemsData.map((item: any) => ({
        id: item.id,
        label: item.label,
        description: item.description,
        rationale: item.rationale,
        review_status: item.review_status,
        accepted_target_id: item.accepted_target_id,
        evidence: evidenceMap.get(item.id) ?? [],
      })) as Stage1Item[];

      const nextAcceptedHistory = (acceptedHistoryRes.data ?? []).map((item: any) => ({
        id: item.id,
        label: item.label,
        description: item.description,
        rationale: item.rationale,
        review_status: item.review_status,
        accepted_target_id: item.accepted_target_id,
        evidence: evidenceMap.get(item.id) ?? [],
      })) as Stage1Item[];

      setStage1Items(nextItems);
      setAcceptedStage1History(nextAcceptedHistory);
      setEditedLabels(
        nextItems.reduce<Record<string, string>>((acc, item) => {
          acc[item.id] = item.label;
          return acc;
        }, {}),
      );
    } catch (error: any) {
      if (isMissingAiFoundation(error)) {
        setAiFoundationReady(false);
        setSelectedRun(null);
        setStage1Items([]);
        setAcceptedStage1History([]);
        setEditedLabels({});
      } else if (isAuthTokenError(error)) {
        await handleAuthFailure();
      } else {
        toast.error(error.message || "Failed to load transcript workspace");
      }
    } finally {
      setTranscriptLoading(false);
    }
  }, [aiFoundationReady, handleAuthFailure, projectId]);

  const loadFocusedWorkspace = useCallback(async () => {
    if (!projectId) return;
    if (!aiFoundationReady) {
      setAcceptedInitialCodes([]);
      setFocusedRun(null);
      setFocusedItems([]);
      setFocusedEditedLabels({});
      return;
    }

    setFocusedLoading(true);
    try {
      const [acceptedRes, focusedRunRes] = await Promise.all([
        supabase
          .from("ai_analysis_items" as any)
          .select("id, transcript_id, label, description, accepted_target_id")
          .eq("project_id", projectId)
          .eq("item_type", "initial_code")
          .eq("review_status", "accepted")
          .order("created_at", { ascending: true }),
        supabase
          .from("ai_analysis_runs" as any)
          .select("id, stage, status, transcript_id, created_at")
          .eq("project_id", projectId)
          .eq("stage", "focused")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (acceptedRes.error) throw acceptedRes.error;
      if (focusedRunRes.error) throw focusedRunRes.error;

      const acceptedRows = (acceptedRes.data ?? []) as Array<{
        id: string;
        transcript_id: string | null;
        label: string;
        description: string | null;
        accepted_target_id: string | null;
      }>;

      const acceptedItemIds = acceptedRows.map((row) => row.id);
      let evidenceData: any[] = [];

      if (acceptedItemIds.length > 0) {
        const { data, error } = await supabase
          .from("ai_analysis_item_evidence" as any)
          .select("item_id, transcript_excerpt, participant_pseudonym")
          .in("item_id", acceptedItemIds);

        if (error) throw error;
        evidenceData = data ?? [];
      }

      const evidenceMap = evidenceData.reduce((map: Map<string, { quotes: string[]; participants: string[] }>, row: any) => {
        const current = map.get(row.item_id) ?? { quotes: [], participants: [] };
        if (row.transcript_excerpt) current.quotes.push(row.transcript_excerpt);
        if (row.participant_pseudonym) current.participants.push(row.participant_pseudonym);
        map.set(row.item_id, current);
        return map;
      }, new Map<string, { quotes: string[]; participants: string[] }>());

      const nextAcceptedCodes = acceptedRows.map((row) => ({
        item_id: row.id,
        code_id: row.accepted_target_id,
        transcript_id: row.transcript_id,
        label: row.label,
        description: row.description,
        evidence_quotes: Array.from(new Set((evidenceMap.get(row.id)?.quotes ?? []).filter(Boolean))).slice(0, 3),
        participant_labels: Array.from(new Set((evidenceMap.get(row.id)?.participants ?? []).filter(Boolean))),
      })) as AcceptedInitialCode[];

      setAcceptedInitialCodes(nextAcceptedCodes);

      const latestFocusedRun = (focusedRunRes.data ?? null) as RunRecord | null;
      setFocusedRun(latestFocusedRun);

      if (!latestFocusedRun) {
        setFocusedItems([]);
        setFocusedEditedLabels({});
        return;
      }

      const { data: focusedItemsData, error: focusedItemsError } = await supabase
        .from("ai_analysis_items" as any)
        .select("id, label, description, rationale, review_status, accepted_target_id, metadata")
        .eq("run_id", latestFocusedRun.id)
        .order("order_index", { ascending: true });

      if (focusedItemsError) throw focusedItemsError;

      const focusedItemIds = (focusedItemsData ?? []).map((item: any) => item.id);
      let focusedEvidenceMap = new Map<string, Stage1Evidence[]>();
      if (focusedItemIds.length > 0) {
        const { data, error } = await supabase
          .from("ai_analysis_item_evidence" as any)
          .select("id, item_id, transcript_excerpt, start_index, end_index, participant_pseudonym")
          .in("item_id", focusedItemIds);
        if (error) throw error;

        focusedEvidenceMap = (data ?? []).reduce((map: Map<string, Stage1Evidence[]>, row: any) => {
          const existing = map.get(row.item_id) ?? [];
          existing.push({
            id: row.id,
            transcript_excerpt: row.transcript_excerpt,
            start_index: row.start_index,
            end_index: row.end_index,
            participant_pseudonym: row.participant_pseudonym,
          });
          map.set(row.item_id, existing);
          return map;
        }, new Map<string, Stage1Evidence[]>());
      }

      const nextFocusedItems = (focusedItemsData ?? []).map((item: any) => ({
        id: item.id,
        label: item.label,
        description: item.description,
        rationale: item.rationale,
        review_status: item.review_status,
        accepted_target_id: item.accepted_target_id,
        evidence: focusedEvidenceMap.get(item.id) ?? [],
        member_item_ids: item.metadata?.member_item_ids ?? [],
        member_code_ids: item.metadata?.member_code_ids ?? [],
        member_labels: item.metadata?.member_labels ?? [],
      })) as FocusedGroupItem[];

      setFocusedItems(nextFocusedItems);
      setFocusedEditedLabels(nextFocusedItems.reduce<Record<string, string>>((acc, item) => {
        acc[item.id] = item.label;
        return acc;
      }, {}));
    } catch (error: any) {
      if (isMissingAiFoundation(error)) {
        setAiFoundationReady(false);
        setAcceptedInitialCodes([]);
        setFocusedRun(null);
        setFocusedItems([]);
        setFocusedEditedLabels({});
      } else if (isAuthTokenError(error)) {
        await handleAuthFailure();
      } else {
        toast.error(error.message || "Failed to load focused grouping workspace");
      }
    } finally {
      setFocusedLoading(false);
    }
  }, [aiFoundationReady, handleAuthFailure, projectId]);

  const loadThemesWorkspace = useCallback(async () => {
    if (!projectId) return;
    if (!aiFoundationReady) {
      setAcceptedFocusedGroups([]);
      setThemeRun(null);
      setThemeItems([]);
      setThemeEditedLabels({});
      return;
    }

    setThemesLoading(true);
    try {
      const [acceptedRes, themeRunRes] = await Promise.all([
        supabase
          .from("ai_analysis_items" as any)
          .select("id, label, description, accepted_target_id, metadata")
          .eq("project_id", projectId)
          .eq("item_type", "focused_group")
          .eq("review_status", "accepted")
          .order("created_at", { ascending: true }),
        supabase
          .from("ai_analysis_runs" as any)
          .select("id, stage, status, transcript_id, created_at")
          .eq("project_id", projectId)
          .eq("stage", "themes")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (acceptedRes.error) throw acceptedRes.error;
      if (themeRunRes.error) throw themeRunRes.error;

      const acceptedRows = (acceptedRes.data ?? []) as Array<{
        id: string;
        label: string;
        description: string | null;
        accepted_target_id: string | null;
        metadata?: {
          member_labels?: string[];
        };
      }>;

      const acceptedItemIds = acceptedRows.map((row) => row.id);
      let evidenceData: any[] = [];
      if (acceptedItemIds.length > 0) {
        const { data, error } = await supabase
          .from("ai_analysis_item_evidence" as any)
          .select("item_id, transcript_excerpt")
          .in("item_id", acceptedItemIds);
        if (error) throw error;
        evidenceData = data ?? [];
      }

      const evidenceMap = evidenceData.reduce((map: Map<string, string[]>, row: any) => {
        const current = map.get(row.item_id) ?? [];
        if (row.transcript_excerpt) current.push(row.transcript_excerpt);
        map.set(row.item_id, current);
        return map;
      }, new Map<string, string[]>());

      const nextAcceptedGroups = acceptedRows.map((row) => ({
        item_id: row.id,
        category_id: row.accepted_target_id,
        label: row.label,
        description: row.description,
        member_labels: Array.isArray(row.metadata?.member_labels) ? row.metadata?.member_labels ?? [] : [],
        evidence_quotes: Array.from(new Set((evidenceMap.get(row.id) ?? []).filter(Boolean))).slice(0, 4),
      })) as AcceptedFocusedGroup[];

      setAcceptedFocusedGroups(nextAcceptedGroups);

      const latestThemeRun = (themeRunRes.data ?? null) as RunRecord | null;
      setThemeRun(latestThemeRun);

      if (!latestThemeRun) {
        setThemeItems([]);
        setThemeEditedLabels({});
        return;
      }

      const { data: themeItemsData, error: themeItemsError } = await supabase
        .from("ai_analysis_items" as any)
        .select("id, label, description, rationale, review_status, accepted_target_id, metadata")
        .eq("run_id", latestThemeRun.id)
        .eq("item_type", "theme")
        .order("order_index", { ascending: true });

      if (themeItemsError) throw themeItemsError;

      const themeItemIds = (themeItemsData ?? []).map((item: any) => item.id);
      let themeEvidenceMap = new Map<string, Stage1Evidence[]>();
      if (themeItemIds.length > 0) {
        const { data, error } = await supabase
          .from("ai_analysis_item_evidence" as any)
          .select("id, item_id, transcript_excerpt, start_index, end_index, participant_pseudonym")
          .in("item_id", themeItemIds);
        if (error) throw error;
        themeEvidenceMap = (data ?? []).reduce((map: Map<string, Stage1Evidence[]>, row: any) => {
          const existing = map.get(row.item_id) ?? [];
          existing.push({
            id: row.id,
            transcript_excerpt: row.transcript_excerpt,
            start_index: row.start_index,
            end_index: row.end_index,
            participant_pseudonym: row.participant_pseudonym,
          });
          map.set(row.item_id, existing);
          return map;
        }, new Map<string, Stage1Evidence[]>());
      }

      const nextThemeItems = (themeItemsData ?? []).map((item: any) => ({
        id: item.id,
        label: item.label,
        description: item.description,
        rationale: item.rationale,
        review_status: item.review_status,
        accepted_target_id: item.accepted_target_id,
        evidence: themeEvidenceMap.get(item.id) ?? [],
        member_item_ids: item.metadata?.member_item_ids ?? [],
        member_category_ids: item.metadata?.member_category_ids ?? [],
        member_labels: item.metadata?.member_labels ?? [],
        subthemes: item.metadata?.subthemes ?? [],
      })) as ThemeSuggestionItem[];

      setThemeItems(nextThemeItems);
      setThemeEditedLabels(nextThemeItems.reduce<Record<string, string>>((acc, item) => {
        acc[item.id] = item.label;
        return acc;
      }, {}));
    } catch (error: any) {
      if (isMissingAiFoundation(error)) {
        setAiFoundationReady(false);
        setAcceptedFocusedGroups([]);
        setThemeRun(null);
        setThemeItems([]);
        setThemeEditedLabels({});
      } else if (isAuthTokenError(error)) {
        await handleAuthFailure();
      } else {
        toast.error(error.message || "Failed to load theme development workspace");
      }
    } finally {
      setThemesLoading(false);
    }
  }, [aiFoundationReady, handleAuthFailure, projectId]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!selectedTranscriptId) return;
    void loadTranscriptWorkspace(selectedTranscriptId);
  }, [loadTranscriptWorkspace, selectedTranscriptId]);

  useEffect(() => {
    void loadFocusedWorkspace();
  }, [loadFocusedWorkspace]);

  useEffect(() => {
    void loadThemesWorkspace();
  }, [loadThemesWorkspace]);

  const consumedCredits = entitlement?.interview_credits_used ?? 0;
  const purchasedCredits = entitlement?.interview_credits_purchased ?? 0;
  const remainingCredits = Math.max(purchasedCredits - consumedCredits, 0);
  const freeTrialUsedCount = Math.max(
    entitlement?.free_trial_interviews_used ?? 0,
    usageRecords.filter((usage) => usage.usage_type === "free_trial" && usage.status !== "cancelled").length,
  );
  const freeTrialAvailable = freeTrialUsedCount < 1;

  const runCounts = useMemo(() => ({
    initial: runs.filter((run) => run.stage === "initial").length,
    focused: runs.filter((run) => run.stage === "focused").length,
    themes: runs.filter((run) => run.stage === "themes").length,
  }), [runs]);

  const transcriptUsage = useMemo(() => {
    if (!selectedTranscriptId) return null;
    return usageRecords.find((usage) => usage.transcript_id === selectedTranscriptId && usage.status !== "cancelled") ?? null;
  }, [selectedTranscriptId, usageRecords]);

  const setupChecks = [
    { label: "Research question", ready: !!project?.research_question?.trim() },
    { label: "Domain framework", ready: !!project?.domain_framework?.trim() },
    { label: "Transcripts uploaded", ready: transcripts.length > 0 },
  ];

  const currentTranscriptMinutes = estimateMinutes(selectedTranscript?.word_count ?? null);
  const unresolvedCount = stage1Items.filter((item) => item.review_status === "draft" || item.review_status === "edited").length;
  const acceptedStage1Items = acceptedStage1History;

  const getUsageDecision = useCallback((transcript: TranscriptSummary | TranscriptDetail): UsageDecision => {
    const interviewMinutes = estimateMinutes(transcript.word_count);
    const existingUsage = usageRecords.find((usage) => usage.transcript_id === transcript.id && usage.status !== "cancelled");
    if (existingUsage) {
      return {
        eligible: true,
        usageType: existingUsage.usage_type,
        creditCost: existingUsage.credit_cost,
        interviewMinutes: existingUsage.interview_minutes ?? interviewMinutes,
        maxMinutesAllowed: existingUsage.max_minutes_allowed ?? (existingUsage.usage_type === "free_trial" ? (entitlement?.max_minutes_free_trial ?? 60) : (entitlement?.max_minutes_per_paid_interview ?? 80)),
      };
    }

    if (AI_TEST_MODE) {
      return {
        eligible: true,
        usageType: "free_trial",
        creditCost: 1,
        interviewMinutes,
        maxMinutesAllowed: entitlement?.max_minutes_per_paid_interview ?? 80,
      };
    }

    const freeLimit = entitlement?.max_minutes_free_trial ?? 60;
    const paidLimit = entitlement?.max_minutes_per_paid_interview ?? 80;
    const paidRemaining = Math.max((entitlement?.interview_credits_purchased ?? 0) - (entitlement?.interview_credits_used ?? 0), 0);

    if (freeTrialUsedCount < 1) {
      if (interviewMinutes > freeLimit) {
        return { eligible: false, reason: `This transcript is estimated at ${interviewMinutes} minutes, which is above the free AI sample limit of ${freeLimit} minutes.` };
      }

      return {
        eligible: true,
        usageType: "free_trial",
        creditCost: 1,
        interviewMinutes,
        maxMinutesAllowed: freeLimit,
      };
    }

    const creditCost = interviewMinutes > paidLimit ? 2 : 1;
    if (paidRemaining < creditCost) {
      return { eligible: false, reason: "This transcript needs paid AI credits, but this project does not have enough remaining interview credits yet." };
    }

    return {
      eligible: true,
      usageType: "paid",
      creditCost,
      interviewMinutes,
      maxMinutesAllowed: paidLimit,
    };
  }, [entitlement, freeTrialUsedCount, usageRecords]);
  const selectedTranscriptDecision = selectedTranscript ? getUsageDecision(selectedTranscript) : null;
  const acceptedInitialCount = acceptedInitialCodes.length;
  const focusedUnresolvedCount = focusedItems.filter((item) => item.review_status === "draft" || item.review_status === "edited").length;
  const canGenerateFocused = acceptedInitialCount >= 3 && initialPendingCount === 0;
  const acceptedFocusedCount = acceptedFocusedGroups.length;
  const themeUnresolvedCount = themeItems.filter((item) => item.review_status === "draft" || item.review_status === "edited").length;
  const canGenerateThemes =
    acceptedFocusedCount >= 2 &&
    focusedPendingCount === 0 &&
    !!project?.research_question?.trim() &&
    !!project?.domain_framework?.trim();

  const syncRunStatus = useCallback(async (runId: string) => {
    const { data, error } = await supabase
      .from("ai_analysis_items" as any)
      .select("review_status")
      .eq("run_id", runId);

    if (error) throw error;

    const statuses = (data ?? []).map((row: any) => row.review_status);
    const unresolved = statuses.filter((status: string) => status === "draft" || status === "edited");
    if (unresolved.length > 0) return;

    const acceptedCount = statuses.filter((status: string) => status === "accepted").length;
    const nextStatus = acceptedCount > 0 ? "accepted" : "rejected";

    const { error: updateError } = await supabase
      .from("ai_analysis_runs" as any)
      .update({ status: nextStatus, accepted_at: acceptedCount > 0 ? new Date().toISOString() : null })
      .eq("id", runId);

    if (updateError) throw updateError;
  }, []);

  const reserveUsageIfNeeded = useCallback(async (transcript: TranscriptDetail) => {
    if (!projectId) throw new Error("Missing project context");

    const existing = usageRecords.find((usage) => usage.transcript_id === transcript.id && usage.status !== "cancelled");
    if (existing) return existing;

    if (AI_TEST_MODE) {
      const decision = getUsageDecision(transcript);
      if (!decision.eligible) {
        throw new Error(decision.reason);
      }

      return {
        id: `testing-${transcript.id}`,
        transcript_id: transcript.id,
        usage_type: decision.usageType,
        credit_cost: decision.creditCost,
        interview_minutes: decision.interviewMinutes,
        max_minutes_allowed: decision.maxMinutesAllowed,
        status: "reserved",
      } as UsageRecord;
    }

    const { data: existingUsageRow, error: existingUsageError } = await supabase
      .from("project_ai_interview_usage" as any)
      .select("id, transcript_id, usage_type, credit_cost, interview_minutes, max_minutes_allowed, status")
      .eq("project_id", projectId)
      .eq("transcript_id", transcript.id)
      .neq("status", "cancelled")
      .maybeSingle();

    if (existingUsageError) throw existingUsageError;
    if (existingUsageRow) return existingUsageRow as UsageRecord;

    const decision = getUsageDecision(transcript);
    if (!decision.eligible) {
      throw new Error(decision.reason);
    }

    const { data: usageInsert, error: usageError } = await supabase
      .from("project_ai_interview_usage" as any)
      .insert({
        project_id: projectId,
        transcript_id: transcript.id,
        usage_type: decision.usageType,
        credit_cost: decision.creditCost,
        interview_minutes: decision.interviewMinutes,
        max_minutes_allowed: decision.maxMinutesAllowed,
        status: "reserved",
        created_by: currentUserId,
      })
      .select("id, transcript_id, usage_type, credit_cost, interview_minutes, max_minutes_allowed, status")
      .single();

    if (usageError) {
      if (usageError.message?.includes("project_ai_interview_usage_project_id_transcript_id_key")) {
        const { data: duplicateUsageRow, error: duplicateUsageError } = await supabase
          .from("project_ai_interview_usage" as any)
          .select("id, transcript_id, usage_type, credit_cost, interview_minutes, max_minutes_allowed, status")
          .eq("project_id", projectId)
          .eq("transcript_id", transcript.id)
          .neq("status", "cancelled")
          .maybeSingle();

        if (duplicateUsageError) throw duplicateUsageError;
        if (duplicateUsageRow) return duplicateUsageRow as UsageRecord;
      }
      throw usageError;
    }

    if (decision.usageType === "free_trial") {
      const nextCount = (entitlement?.free_trial_interviews_used ?? 0) + 1;
      const { error: entitlementError } = await supabase
        .from("project_ai_entitlements" as any)
        .upsert({
          project_id: projectId,
          free_trial_interviews_used: nextCount,
        }, { onConflict: "project_id" });

      if (entitlementError) {
        console.warn("Could not persist free trial counter on entitlement row:", entitlementError.message);
      }
    }

    if (decision.usageType === "paid" && entitlement) {
      const { error: entitlementError } = await supabase
        .from("project_ai_entitlements" as any)
        .update({
          interview_credits_used: entitlement.interview_credits_used + decision.creditCost,
        })
        .eq("project_id", projectId);

      if (entitlementError) {
        console.warn("Could not persist paid credit usage on entitlement row:", entitlementError.message);
      }
    }

    return usageInsert as UsageRecord;
  }, [currentUserId, entitlement, getUsageDecision, projectId, usageRecords]);

  const handleGenerateStage1 = useCallback(async () => {
    if (!projectId || !selectedTranscript || !currentUserId) return;

    setGenerating(true);
    try {
      await reserveUsageIfNeeded(selectedTranscript);

      const promptSnapshot = {
        stage: "initial",
        blind_analysis: true,
        includes_research_question: false,
        includes_domain_framework: false,
        includes_approach: false,
        includes_reasoning_mode: false,
      };

      const { data: runData, error: runError } = await supabase
        .from("ai_analysis_runs" as any)
        .insert({
          project_id: projectId,
          transcript_id: selectedTranscript.id,
          stage: "initial",
          task_type: "initial_coding",
          status: "running",
          provider: "moonshot",
          prompt_snapshot: promptSnapshot,
          config_snapshot: { transcript_first: true, quote_backed: true },
          metadata: {
            participant_pseudonym: selectedTranscript.participant_pseudonym,
            estimated_minutes: estimateMinutes(selectedTranscript.word_count),
            word_count: selectedTranscript.word_count ?? 0,
          },
          created_by: currentUserId,
        })
        .select("id, stage, status, transcript_id, created_at")
        .single();

      if (runError) throw runError;

      const { data, error, response } = await invokeFunctionWithRetry<{ suggestions?: GenerationSuggestion[] }>(
        "ai-stage1-initial-coding",
        {
          participant_pseudonym: selectedTranscript.participant_pseudonym,
          transcript_content: selectedTranscript.content,
        },
      );

      if (error) {
        throw new Error(await getFunctionErrorMessage(error, "Stage 1 AI generation failed.", response));
      }

      const suggestions = Array.isArray((data as { suggestions?: GenerationSuggestion[] } | null)?.suggestions)
        ? ((data as { suggestions?: GenerationSuggestion[] }).suggestions ?? [])
        : [];

      if (suggestions.length === 0) {
        await supabase
          .from("ai_analysis_runs" as any)
          .update({ status: "error", metadata: { empty_response: true } })
          .eq("id", runData.id);
        throw new Error("AI did not return any initial coding suggestions.");
      }

      const { data: insertedItems, error: itemError } = await supabase
        .from("ai_analysis_items" as any)
        .insert(
          suggestions.map((suggestion, index) => ({
            run_id: runData.id,
            project_id: projectId,
            transcript_id: selectedTranscript.id,
            item_type: "initial_code",
            label: normalizeLabel(suggestion.label || `Initial code ${index + 1}`),
            description: suggestion.description?.trim() || null,
            rationale: suggestion.rationale?.trim() || null,
            review_status: "draft",
            order_index: index,
            metadata: { source: "stage1_generation" },
          })),
        )
        .select("id");

      if (itemError) throw itemError;

      const evidenceRows = suggestions.flatMap((suggestion, index) => {
        const itemId = insertedItems?.[index]?.id;
        if (!itemId) return [];

        let searchCursor = 0;
        return (suggestion.evidence ?? [])
          .filter((entry) => entry.quote?.trim())
          .map((entry) => {
            const span = findQuoteSpan(selectedTranscript.content, entry.quote, searchCursor);
            if (span) searchCursor = span.end;

            return {
              item_id: itemId,
              project_id: projectId,
              transcript_id: selectedTranscript.id,
              transcript_excerpt: entry.quote.trim(),
              start_index: span?.start ?? null,
              end_index: span?.end ?? null,
              participant_pseudonym: selectedTranscript.participant_pseudonym,
            };
          });
      });

      if (evidenceRows.length > 0) {
        const { error: evidenceError } = await supabase
          .from("ai_analysis_item_evidence" as any)
          .insert(evidenceRows);

        if (evidenceError) throw evidenceError;
      }

      const { error: finalizeError } = await supabase
        .from("ai_analysis_runs" as any)
        .update({ status: "review" })
        .eq("id", runData.id);

      if (finalizeError) throw finalizeError;

      await loadOverview();
      await loadTranscriptWorkspace(selectedTranscript.id);
      revealStage1Review();
      toast.success("Initial coding suggestions are ready below in Step 3.");
    } catch (error: any) {
      if (isAuthTokenError(error)) {
        await handleAuthFailure();
      } else {
        toast.error(error.message || "Failed to generate Stage 1 suggestions");
      }
    } finally {
      setGenerating(false);
    }
  }, [currentUserId, handleAuthFailure, invokeFunctionWithRetry, loadOverview, loadTranscriptWorkspace, projectId, reserveUsageIfNeeded, revealStage1Review, selectedTranscript]);

  const handleAcceptItem = useCallback(async (item: Stage1Item) => {
    if (!projectId || !selectedTranscript || !currentUserId) return;

    const finalLabel = normalizeLabel(editedLabels[item.id] ?? item.label);
    if (!finalLabel) {
      toast.error("Code label cannot be empty.");
      return;
    }

    setUpdatingItemId(item.id);
    try {
      const { data: existingCodeRows, error: existingCodeError } = await supabase
        .from("codes")
        .select("id, label")
        .eq("project_id", projectId)
        .eq("label", finalLabel)
        .limit(1);

      if (existingCodeError) throw existingCodeError;

      let codeId = existingCodeRows?.[0]?.id ?? null;
      if (!codeId) {
        const { data: codeInsert, error: codeError } = await supabase
          .from("codes")
          .insert({
            project_id: projectId,
            label: finalLabel,
            origin: "researcher",
            cycle: "first",
            example_quote: item.evidence[0]?.transcript_excerpt ?? null,
            ai_suggested: true,
            created_via_ai: true,
            researcher_confirmed: true,
            created_by: currentUserId,
          })
          .select("id")
          .single();

        if (codeError) throw codeError;
        codeId = codeInsert.id;
      }

      const { data: existingApps, error: appLoadError } = await supabase
        .from("code_applications")
        .select("start_index, end_index, code_id")
        .eq("transcript_id", selectedTranscript.id)
        .eq("code_id", codeId);

      if (appLoadError) throw appLoadError;

      const existingRanges = new Set((existingApps ?? []).map((app) => `${app.code_id}:${app.start_index}:${app.end_index}`));
      const appInserts = item.evidence
        .filter((evidence) => evidence.start_index !== null && evidence.end_index !== null)
        .filter((evidence) => !existingRanges.has(`${codeId}:${evidence.start_index}:${evidence.end_index}`))
        .map((evidence) => ({
          code_id: codeId,
          transcript_id: selectedTranscript.id,
          applied_by: currentUserId,
          segment_text: evidence.transcript_excerpt,
          start_index: evidence.start_index as number,
          end_index: evidence.end_index as number,
        }));

      if (appInserts.length > 0) {
        const { error: insertAppsError } = await supabase
          .from("code_applications")
          .insert(appInserts);

        if (insertAppsError) throw insertAppsError;
      }

      const { error: updateError } = await supabase
        .from("ai_analysis_items" as any)
        .update({
          label: finalLabel,
          review_status: "accepted",
          accepted_target_type: "code",
          accepted_target_id: codeId,
        })
        .eq("id", item.id);

      if (updateError) throw updateError;

      if (selectedRun?.id) {
        await syncRunStatus(selectedRun.id);
      }

      await loadOverview();
      await loadTranscriptWorkspace(selectedTranscript.id);
      toast.success(`Accepted "${finalLabel}" into your codebook.`);
    } catch (error: any) {
      if (isAuthTokenError(error)) {
        await handleAuthFailure();
      } else {
        toast.error(error.message || "Failed to accept AI suggestion");
      }
    } finally {
      setUpdatingItemId(null);
    }
  }, [currentUserId, editedLabels, handleAuthFailure, loadOverview, loadTranscriptWorkspace, projectId, selectedRun?.id, selectedTranscript, syncRunStatus]);

  const handleRejectItem = useCallback(async (itemId: string) => {
    if (!selectedTranscript) return;

    setUpdatingItemId(itemId);
    try {
      const { error } = await supabase
        .from("ai_analysis_items" as any)
        .update({ review_status: "rejected" })
        .eq("id", itemId);

      if (error) throw error;

      if (selectedRun?.id) {
        await syncRunStatus(selectedRun.id);
      }

      await loadOverview();
      await loadTranscriptWorkspace(selectedTranscript.id);
      toast.success("Suggestion rejected.");
    } catch (error: any) {
      if (isAuthTokenError(error)) {
        await handleAuthFailure();
      } else {
        toast.error(error.message || "Failed to reject suggestion");
      }
    } finally {
      setUpdatingItemId(null);
    }
  }, [handleAuthFailure, loadOverview, loadTranscriptWorkspace, selectedRun?.id, selectedTranscript, syncRunStatus]);

  const handleGenerateFocusedGrouping = useCallback(async () => {
    if (!projectId || !currentUserId) return;
    if (acceptedInitialCodes.length < 3) {
      toast.error("Accept at least 3 Stage 1 codes before generating focused groups.");
      return;
    }
    if (initialPendingCount > 0) {
      toast.error("Finish reviewing all draft Stage 1 suggestions before generating focused groups.");
      return;
    }

    setGeneratingFocused(true);
    try {
      const { data: runData, error: runError } = await supabase
        .from("ai_analysis_runs" as any)
        .insert({
          project_id: projectId,
          transcript_id: null,
          stage: "focused",
          task_type: "focused_grouping",
          status: "running",
          provider: "moonshot",
          prompt_snapshot: {
            stage: "focused",
            includes_research_question: false,
            includes_domain_framework: false,
            includes_approach: false,
            includes_reasoning_mode: false,
            preserve_initial_labels: true,
          },
          config_snapshot: { project_level: true, uses_accepted_stage1_outputs: true },
          metadata: { accepted_initial_code_count: acceptedInitialCodes.length },
          created_by: currentUserId,
        })
        .select("id, stage, status, transcript_id, created_at")
        .single();

      if (runError) throw runError;

      const { data, error, response } = await invokeFunctionWithRetry<{ groups?: Array<any> }>(
        "ai-stage2-focused-grouping",
        {
          accepted_codes: acceptedInitialCodes.map((code) => ({
            item_id: code.item_id,
            code_id: code.code_id,
            label: code.label,
            description: code.description,
            evidence_quotes: code.evidence_quotes,
          })),
        },
      );

      if (error) {
        throw new Error(await getFunctionErrorMessage(error, "Focused grouping AI generation failed.", response));
      }

      const groups = Array.isArray((data as { groups?: Array<any> } | null)?.groups)
        ? ((data as { groups?: Array<any> }).groups ?? [])
        : [];

      if (groups.length === 0) {
        await supabase.from("ai_analysis_runs" as any).update({ status: "error", metadata: { empty_response: true } }).eq("id", runData.id);
        throw new Error("AI did not return any focused grouping suggestions.");
      }

      const acceptedByItemId = new Map(acceptedInitialCodes.map((code) => [code.item_id, code]));

      const normalizedGroups = groups
        .map((group: any, index: number) => {
          const memberItemIds = Array.isArray(group.member_item_ids)
            ? group.member_item_ids.filter((id: string) => acceptedByItemId.has(id))
            : [];

          if (memberItemIds.length < 2) return null;

          const memberCodes = memberItemIds.map((id: string) => acceptedByItemId.get(id)!);
          return {
            order_index: index,
            label: normalizeLabel(group.name || `Focused group ${index + 1}`),
            description: group.description?.trim() || null,
            rationale: group.rationale?.trim() || null,
            member_item_ids: memberItemIds,
            member_code_ids: memberCodes.map((code) => code.code_id).filter(Boolean),
            member_labels: memberCodes.map((code) => code.label),
            supporting_quotes: Array.isArray(group.supporting_quotes)
              ? group.supporting_quotes.filter((quote: string) => typeof quote === "string" && quote.trim())
              : memberCodes.flatMap((code) => code.evidence_quotes).slice(0, 3),
          };
        })
        .filter(Boolean) as Array<{
          order_index: number;
          label: string;
          description: string | null;
          rationale: string | null;
          member_item_ids: string[];
          member_code_ids: string[];
          member_labels: string[];
          supporting_quotes: string[];
        }>;

      if (normalizedGroups.length === 0) {
        await supabase.from("ai_analysis_runs" as any).update({ status: "error", metadata: { invalid_group_response: true } }).eq("id", runData.id);
        throw new Error("AI returned groups, but none were usable.");
      }

      const { data: insertedItems, error: itemError } = await supabase
        .from("ai_analysis_items" as any)
        .insert(normalizedGroups.map((group) => ({
          run_id: runData.id,
          project_id: projectId,
          transcript_id: null,
          item_type: "focused_group",
          label: group.label,
          description: group.description,
          rationale: group.rationale,
          review_status: "draft",
          order_index: group.order_index,
          metadata: {
            member_item_ids: group.member_item_ids,
            member_code_ids: group.member_code_ids,
            member_labels: group.member_labels,
          },
        })))
        .select("id");

      if (itemError) throw itemError;

      const evidenceRows = normalizedGroups.flatMap((group, index) => {
        const itemId = insertedItems?.[index]?.id;
        if (!itemId) return [];
        return group.supporting_quotes.slice(0, 3).map((quote) => ({
          item_id: itemId,
          project_id: projectId,
          transcript_id: acceptedByItemId.get(group.member_item_ids[0])?.transcript_id,
          transcript_excerpt: quote,
          start_index: null,
          end_index: null,
          participant_pseudonym: acceptedByItemId.get(group.member_item_ids[0])?.participant_labels?.[0] ?? null,
        }));
      }).filter((row) => row.transcript_id);

      if (evidenceRows.length > 0) {
        const { error: evidenceError } = await supabase.from("ai_analysis_item_evidence" as any).insert(evidenceRows);
        if (evidenceError) throw evidenceError;
      }

      const { error: finalizeError } = await supabase.from("ai_analysis_runs" as any).update({ status: "review" }).eq("id", runData.id);
      if (finalizeError) throw finalizeError;

      await loadOverview();
      await loadFocusedWorkspace();
      revealFocusedReview();
      toast.success("Focused grouping suggestions are ready below in Step 3.");
    } catch (error: any) {
      if (isAuthTokenError(error)) {
        await handleAuthFailure();
      } else {
        toast.error(error.message || "Failed to generate focused groups");
      }
    } finally {
      setGeneratingFocused(false);
    }
  }, [acceptedInitialCodes, currentUserId, handleAuthFailure, initialPendingCount, invokeFunctionWithRetry, loadFocusedWorkspace, loadOverview, projectId, revealFocusedReview]);

  const handleAcceptFocusedItem = useCallback(async (item: FocusedGroupItem) => {
    if (!projectId || !currentUserId) return;

    const finalLabel = normalizeLabel(focusedEditedLabels[item.id] ?? item.label);
    if (!finalLabel) {
      toast.error("Category name cannot be empty.");
      return;
    }

    setUpdatingFocusedItemId(item.id);
    try {
      const { data: existingCategoryRows, error: existingCategoryError } = await supabase
        .from("categories" as any)
        .select("id")
        .eq("project_id", projectId)
        .eq("name", finalLabel)
        .limit(1);

      if (existingCategoryError) throw existingCategoryError;

      let categoryId = existingCategoryRows?.[0]?.id ?? null;
      if (!categoryId) {
        const { data: categoryInsert, error: categoryError } = await supabase
          .from("categories" as any)
          .insert({
            project_id: projectId,
            name: finalLabel,
            description: item.description,
            created_by: currentUserId,
            parent_category_id: null,
          })
          .select("id")
          .single();

        if (categoryError) throw categoryError;
        categoryId = categoryInsert.id;
      }

      if (item.member_code_ids.length > 0) {
        const { error: deleteExistingError } = await supabase
          .from("code_categories" as any)
          .delete()
          .in("code_id", item.member_code_ids);
        if (deleteExistingError) throw deleteExistingError;

        const { error: insertMappingError } = await supabase
          .from("code_categories" as any)
          .insert(item.member_code_ids.map((codeId) => ({
            project_id: projectId,
            code_id: codeId,
            category_id: categoryId,
            created_by: currentUserId,
          })));
        if (insertMappingError) throw insertMappingError;
      }

      const { error: updateError } = await supabase
        .from("ai_analysis_items" as any)
        .update({
          label: finalLabel,
          review_status: "accepted",
          accepted_target_type: "category",
          accepted_target_id: categoryId,
        })
        .eq("id", item.id);
      if (updateError) throw updateError;

      if (focusedRun?.id) {
        await syncRunStatus(focusedRun.id);
      }

      await loadOverview();
      await loadFocusedWorkspace();
      toast.success(`Accepted "${finalLabel}" into your categories.`);
    } catch (error: any) {
      if (isAuthTokenError(error)) {
        await handleAuthFailure();
      } else {
        toast.error(error.message || "Failed to accept focused group");
      }
    } finally {
      setUpdatingFocusedItemId(null);
    }
  }, [currentUserId, focusedEditedLabels, focusedRun?.id, handleAuthFailure, loadFocusedWorkspace, loadOverview, projectId, syncRunStatus]);

  const handleRejectFocusedItem = useCallback(async (itemId: string) => {
    setUpdatingFocusedItemId(itemId);
    try {
      const { error } = await supabase.from("ai_analysis_items" as any).update({ review_status: "rejected" }).eq("id", itemId);
      if (error) throw error;

      if (focusedRun?.id) {
        await syncRunStatus(focusedRun.id);
      }

      await loadOverview();
      await loadFocusedWorkspace();
      toast.success("Focused group rejected.");
    } catch (error: any) {
      if (isAuthTokenError(error)) {
        await handleAuthFailure();
      } else {
        toast.error(error.message || "Failed to reject focused group");
      }
    } finally {
      setUpdatingFocusedItemId(null);
    }
  }, [focusedRun?.id, handleAuthFailure, loadFocusedWorkspace, loadOverview, syncRunStatus]);

  const handleGenerateThemes = useCallback(async () => {
    if (!projectId || !currentUserId || !project) return;
    if (acceptedFocusedGroups.length < 2) {
      toast.error("Accept at least 2 focused groups before generating themes.");
      return;
    }
    if (focusedPendingCount > 0) {
      toast.error("Finish reviewing all focused grouping drafts before generating themes.");
      return;
    }
    if (!project.research_question?.trim() || !project.domain_framework?.trim()) {
      toast.error("Add both a research question and a domain framework before generating themes.");
      return;
    }

    setGeneratingThemes(true);
    try {
      const { data: runData, error: runError } = await supabase
        .from("ai_analysis_runs" as any)
        .insert({
          project_id: projectId,
          transcript_id: null,
          stage: "themes",
          task_type: "theme_development",
          status: "running",
          provider: "moonshot",
          prompt_snapshot: {
            stage: "themes",
            includes_research_question: true,
            includes_domain_framework: true,
            includes_approach: !!project.approach,
            includes_reasoning_mode: !!project.reasoning_mode,
            uses_accepted_focused_groups: true,
          },
          config_snapshot: { project_level: true, produces_themes_and_subthemes: true },
          metadata: { accepted_focused_group_count: acceptedFocusedGroups.length },
          created_by: currentUserId,
        })
        .select("id, stage, status, transcript_id, created_at")
        .single();

      if (runError) throw runError;

      const { data, error, response } = await invokeFunctionWithRetry<{ themes?: Array<any> }>(
        "ai-stage3-theme-development",
        {
          project_context: {
            research_question: project.research_question,
            domain_framework: project.domain_framework,
            approach: project.approach,
            reasoning_mode: project.reasoning_mode,
          },
          accepted_groups: acceptedFocusedGroups.map((group) => ({
            item_id: group.item_id,
            category_id: group.category_id,
            label: group.label,
            description: group.description,
            member_labels: group.member_labels,
            evidence_quotes: group.evidence_quotes,
          })),
        },
      );

      if (error) {
        throw new Error(await getFunctionErrorMessage(error, "Theme development AI generation failed.", response));
      }

      const themes = Array.isArray((data as { themes?: Array<any> } | null)?.themes)
        ? ((data as { themes?: Array<any> }).themes ?? [])
        : [];

      if (themes.length === 0) {
        await supabase.from("ai_analysis_runs" as any).update({ status: "error", metadata: { empty_response: true } }).eq("id", runData.id);
        throw new Error("AI did not return any theme suggestions.");
      }

      const acceptedByItemId = new Map(acceptedFocusedGroups.map((group) => [group.item_id, group]));

      const normalizedThemes = themes
        .map((theme: any, index: number) => {
          const memberItemIds = Array.isArray(theme.member_item_ids)
            ? theme.member_item_ids.filter((id: string) => acceptedByItemId.has(id))
            : [];

          if (memberItemIds.length < 2) return null;

          const memberGroups = memberItemIds.map((id: string) => acceptedByItemId.get(id)!);
          return {
            order_index: index,
            label: normalizeLabel(theme.name || `Theme ${index + 1}`),
            description: theme.description?.trim() || null,
            rationale: theme.rationale?.trim() || null,
            member_item_ids: memberItemIds,
            member_category_ids: memberGroups.map((group) => group.category_id).filter(Boolean),
            member_labels: memberGroups.map((group) => group.label),
            supporting_quotes: Array.isArray(theme.supporting_quotes)
              ? theme.supporting_quotes.filter((quote: string) => typeof quote === "string" && quote.trim())
              : memberGroups.flatMap((group) => group.evidence_quotes).slice(0, 4),
            subthemes: Array.isArray(theme.subthemes)
              ? theme.subthemes
                  .map((subtheme: any) => ({
                    name: normalizeLabel(subtheme?.name || ""),
                    description: subtheme?.description?.trim() || null,
                  }))
                  .filter((subtheme: { name: string }) => subtheme.name)
              : [],
          };
        })
        .filter(Boolean) as Array<{
          order_index: number;
          label: string;
          description: string | null;
          rationale: string | null;
          member_item_ids: string[];
          member_category_ids: string[];
          member_labels: string[];
          supporting_quotes: string[];
          subthemes: Array<{ name: string; description?: string | null }>;
        }>;

      if (normalizedThemes.length === 0) {
        await supabase.from("ai_analysis_runs" as any).update({ status: "error", metadata: { invalid_theme_response: true } }).eq("id", runData.id);
        throw new Error("AI returned themes, but none were usable.");
      }

      const { data: insertedItems, error: itemError } = await supabase
        .from("ai_analysis_items" as any)
        .insert(normalizedThemes.map((theme) => ({
          run_id: runData.id,
          project_id: projectId,
          transcript_id: null,
          item_type: "theme",
          label: theme.label,
          description: theme.description,
          rationale: theme.rationale,
          review_status: "draft",
          order_index: theme.order_index,
          metadata: {
            member_item_ids: theme.member_item_ids,
            member_category_ids: theme.member_category_ids,
            member_labels: theme.member_labels,
            subthemes: theme.subthemes,
          },
        })))
        .select("id");

      if (itemError) throw itemError;

      const evidenceRows = normalizedThemes.flatMap((theme, index) => {
        const itemId = insertedItems?.[index]?.id;
        if (!itemId) return [];
        return theme.supporting_quotes.slice(0, 4).map((quote) => ({
          item_id: itemId,
          project_id: projectId,
          transcript_id: acceptedByItemId.get(theme.member_item_ids[0])?.category_id ? null : null,
          transcript_excerpt: quote,
          start_index: null,
          end_index: null,
          participant_pseudonym: null,
        }));
      });

      const filteredEvidenceRows = evidenceRows.filter((row) => row.transcript_excerpt);
      if (filteredEvidenceRows.length > 0) {
        const transcriptIdByItemId = new Map<string, string>();
        const { data: evidenceSources } = await supabase
          .from("ai_analysis_item_evidence" as any)
          .select("item_id, transcript_id, participant_pseudonym")
          .in("item_id", acceptedFocusedGroups.map((group) => group.item_id));

        (evidenceSources ?? []).forEach((row: any) => {
          if (row.item_id && row.transcript_id && !transcriptIdByItemId.has(row.item_id)) {
            transcriptIdByItemId.set(row.item_id, row.transcript_id);
          }
        });

        const enrichedEvidenceRows = normalizedThemes.flatMap((theme, index) => {
          const itemId = insertedItems?.[index]?.id;
          if (!itemId) return [];
          const sourceTranscriptId = transcriptIdByItemId.get(theme.member_item_ids[0]);
          if (!sourceTranscriptId) return [];
          return theme.supporting_quotes.slice(0, 4).map((quote) => ({
            item_id: itemId,
            project_id: projectId,
            transcript_id: sourceTranscriptId,
            transcript_excerpt: quote,
            start_index: null,
            end_index: null,
            participant_pseudonym: null,
          }));
        });

        if (enrichedEvidenceRows.length > 0) {
          const { error: evidenceError } = await supabase.from("ai_analysis_item_evidence" as any).insert(enrichedEvidenceRows);
          if (evidenceError) throw evidenceError;
        }
      }

      const { error: finalizeError } = await supabase.from("ai_analysis_runs" as any).update({ status: "review" }).eq("id", runData.id);
      if (finalizeError) throw finalizeError;

      await loadOverview();
      await loadThemesWorkspace();
      revealThemeReview();
      toast.success("Theme suggestions are ready below in Step 3.");
    } catch (error: any) {
      if (isAuthTokenError(error)) {
        await handleAuthFailure();
      } else {
        toast.error(error.message || "Failed to generate themes");
      }
    } finally {
      setGeneratingThemes(false);
    }
  }, [acceptedFocusedGroups, currentUserId, focusedPendingCount, handleAuthFailure, invokeFunctionWithRetry, loadOverview, loadThemesWorkspace, project, projectId, revealThemeReview]);

  const handleAcceptThemeItem = useCallback(async (item: ThemeSuggestionItem) => {
    if (!projectId || !currentUserId) return;

    const finalLabel = normalizeLabel(themeEditedLabels[item.id] ?? item.label);
    if (!finalLabel) {
      toast.error("Theme name cannot be empty.");
      return;
    }

    setUpdatingThemeItemId(item.id);
    try {
      const { data: existingThemeRows, error: existingThemeError } = await supabase
        .from("themes" as any)
        .select("id")
        .eq("project_id", projectId)
        .eq("name", finalLabel)
        .limit(1);

      if (existingThemeError) throw existingThemeError;

      let themeId = existingThemeRows?.[0]?.id ?? null;
      if (!themeId) {
        const { data: themeInsert, error: themeError } = await supabase
          .from("themes" as any)
          .insert({
            project_id: projectId,
            name: finalLabel,
            description: item.description,
            created_by: currentUserId,
            parent_theme_id: null,
          })
          .select("id")
          .single();
        if (themeError) throw themeError;
        themeId = themeInsert.id;
      }

      for (const subtheme of item.subthemes) {
        const subthemeName = normalizeLabel(subtheme.name);
        if (!subthemeName) continue;

        const { data: existingSubthemeRows, error: existingSubthemeError } = await supabase
          .from("themes" as any)
          .select("id")
          .eq("project_id", projectId)
          .eq("name", subthemeName)
          .eq("parent_theme_id", themeId)
          .limit(1);
        if (existingSubthemeError) throw existingSubthemeError;

        if (!existingSubthemeRows?.length) {
          const { error: insertSubthemeError } = await supabase
            .from("themes" as any)
            .insert({
              project_id: projectId,
              name: subthemeName,
              description: subtheme.description ?? null,
              created_by: currentUserId,
              parent_theme_id: themeId,
            });
          if (insertSubthemeError) throw insertSubthemeError;
        }
      }

      if (item.member_category_ids.length > 0) {
        const { error: deleteExistingError } = await supabase
          .from("category_themes" as any)
          .delete()
          .in("category_id", item.member_category_ids);
        if (deleteExistingError) throw deleteExistingError;

        const { error: insertMappingError } = await supabase
          .from("category_themes" as any)
          .insert(item.member_category_ids.map((categoryId) => ({
            project_id: projectId,
            category_id: categoryId,
            theme_id: themeId,
            created_by: currentUserId,
          })));
        if (insertMappingError) throw insertMappingError;
      }

      const { error: updateError } = await supabase
        .from("ai_analysis_items" as any)
        .update({
          label: finalLabel,
          review_status: "accepted",
          accepted_target_type: "theme",
          accepted_target_id: themeId,
        })
        .eq("id", item.id);
      if (updateError) throw updateError;

      if (themeRun?.id) {
        await syncRunStatus(themeRun.id);
      }

      await loadOverview();
      await loadThemesWorkspace();
      toast.success(`Accepted "${finalLabel}" into your themes.`);
    } catch (error: any) {
      if (isAuthTokenError(error)) {
        await handleAuthFailure();
      } else {
        toast.error(error.message || "Failed to accept theme suggestion");
      }
    } finally {
      setUpdatingThemeItemId(null);
    }
  }, [currentUserId, handleAuthFailure, loadOverview, loadThemesWorkspace, projectId, syncRunStatus, themeEditedLabels, themeRun?.id]);

  const handleRejectThemeItem = useCallback(async (itemId: string) => {
    setUpdatingThemeItemId(itemId);
    try {
      const { error } = await supabase.from("ai_analysis_items" as any).update({ review_status: "rejected" }).eq("id", itemId);
      if (error) throw error;

      if (themeRun?.id) {
        await syncRunStatus(themeRun.id);
      }

      await loadOverview();
      await loadThemesWorkspace();
      toast.success("Theme suggestion rejected.");
    } catch (error: any) {
      if (isAuthTokenError(error)) {
        await handleAuthFailure();
      } else {
        toast.error(error.message || "Failed to reject theme suggestion");
      }
    } finally {
      setUpdatingThemeItemId(null);
    }
  }, [handleAuthFailure, loadOverview, loadThemesWorkspace, syncRunStatus, themeRun?.id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading AI Analysis…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[1200px] items-center gap-4 px-8 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="font-heading text-xl text-foreground">{project?.title || "Project"}</h1>
            <p className="text-xs text-muted-foreground">AI Analysis</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/project/${projectId}/transcripts`)}>
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              Transcripts
            </Button>
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
            <Button variant="ghost" size="sm" onClick={() => navigate(`/project/${projectId}/canvas`)}>
              <Network className="mr-1.5 h-3.5 w-3.5" />
              Canvas
            </Button>
            <Button variant="default" size="sm">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              AI Analysis
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-8 py-10">
        <section className="relative overflow-hidden rounded-[28px] border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-secondary/30 p-8 shadow-sm">
          <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute bottom-0 right-24 h-24 w-24 rounded-full bg-secondary/40 blur-2xl" />
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-primary/30 bg-background/80 text-[10px] uppercase tracking-[0.22em] text-primary">
                  AI Analysis
                </Badge>
                <Badge variant={freeTrialAvailable ? "secondary" : "outline"} className="bg-background/80">
                  {freeTrialAvailable ? "1 free AI sample interview available" : "Free AI sample already used"}
                </Badge>
              </div>
              <h2 className="font-heading text-3xl tracking-tight text-foreground">
                {activeStage === "initial"
                  ? "Step 1: Initial coding"
                  : activeStage === "focused"
                    ? "Step 2: Focused grouping"
                    : "Step 3: Theme development"}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                {activeStage === "initial"
                  ? "Start with one interview at a time. AI suggests grounded initial codes from the transcript itself, then you decide what belongs in the codebook."
                  : activeStage === "focused"
                    ? "Once your initial coding is reviewed, AI helps you group accepted codes into broader descriptive buckets that can become categories."
                    : "After focused groups are reviewed, AI uses your research context to propose themes and subthemes that you can accept into the project."}
              </p>
              <div className="mt-5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {activeStage === "initial" ? (
                  <>
                    <div className="rounded-full border border-border bg-background/80 px-3 py-1.5">Blind first pass</div>
                    <div className="rounded-full border border-border bg-background/80 px-3 py-1.5">Quote-backed suggestions</div>
                    <div className="rounded-full border border-border bg-background/80 px-3 py-1.5">Researcher approves every code</div>
                  </>
                ) : activeStage === "focused" ? (
                  <>
                    <div className="rounded-full border border-border bg-background/80 px-3 py-1.5">Project-level grouping</div>
                    <div className="rounded-full border border-border bg-background/80 px-3 py-1.5">Preserve original code labels</div>
                    <div className="rounded-full border border-border bg-background/80 px-3 py-1.5">Accepted groups become categories</div>
                  </>
                ) : (
                  <>
                    <div className="rounded-full border border-border bg-background/80 px-3 py-1.5">Research question introduced here</div>
                    <div className="rounded-full border border-border bg-background/80 px-3 py-1.5">Subthemes included</div>
                    <div className="rounded-full border border-border bg-background/80 px-3 py-1.5">Accepted suggestions become themes</div>
                  </>
                )}
              </div>
            </div>

            <div className="grid min-w-[280px] gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-background/85 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Credits</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{remainingCredits}</p>
                <p className="mt-1 text-xs text-muted-foreground">remaining for this project</p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/85 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  {activeStage === "initial" ? "Transcripts" : activeStage === "focused" ? "Accepted codes" : "Accepted groups"}
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {activeStage === "initial" ? transcripts.length : activeStage === "focused" ? acceptedInitialCount : acceptedFocusedCount}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {activeStage === "initial" ? "available for AI analysis" : activeStage === "focused" ? "ready for grouping" : "ready for theme development"}
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/85 p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  {activeStage === "initial" ? "Stage 1 runs" : activeStage === "focused" ? "Stage 2 runs" : "Stage 3 runs"}
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {activeStage === "initial" ? runCounts.initial : activeStage === "focused" ? runCounts.focused : runCounts.themes}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {activeStage === "initial" ? "saved transcript-first passes" : activeStage === "focused" ? "saved grouping passes" : "saved thematic passes"}
                </p>
              </div>
            </div>
          </div>
        </section>

        {!aiFoundationReady ? (
          <Alert className="mt-6 border-amber-300/60 bg-amber-50 text-amber-950">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>AI Analysis needs the Phase 1 Supabase migration</AlertTitle>
            <AlertDescription>
              Run the SQL from the local migration file at <span className="font-mono">supabase/migrations/20260411_ai_analysis_foundation.sql</span> in your Supabase SQL Editor, then refresh this page. The app is trying to use AI tables like <span className="font-mono">project_ai_entitlements</span>, but they are not in the current database yet.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="mt-8">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Choose your AI step</p>
          <Tabs value={activeStage} onValueChange={(value) => setActiveStage(value as "initial" | "focused" | "themes")}>
          <TabsList className="grid h-auto w-full max-w-[1040px] grid-cols-3 rounded-2xl border border-border bg-secondary/30 p-1.5">
            <TabsTrigger value="initial" className="min-h-[88px] rounded-xl border border-transparent px-4 py-3 text-left data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <div className="flex w-full items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground">
                  1
                </div>
                <div className="flex min-w-0 flex-1 flex-col items-start text-left">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Sparkles className="h-4 w-4" />
                    Initial coding
                  </div>
                  <div className="mt-1 text-xs font-normal leading-5 text-muted-foreground">
                    Transcript-by-transcript first pass
                  </div>
                </div>
              </div>
            </TabsTrigger>
            <TabsTrigger value="focused" className="min-h-[88px] rounded-xl border border-transparent px-4 py-3 text-left data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <div className="flex w-full items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground">
                  2
                </div>
                <div className="flex min-w-0 flex-1 flex-col items-start text-left">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Layers3 className="h-4 w-4" />
                    Focused grouping
                  </div>
                  <div className="mt-1 text-xs font-normal leading-5 text-muted-foreground">
                    Group accepted codes into categories
                  </div>
                </div>
              </div>
            </TabsTrigger>
            <TabsTrigger value="themes" className="min-h-[88px] rounded-xl border border-transparent px-4 py-3 text-left data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <div className="flex w-full items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground">
                  3
                </div>
                <div className="flex min-w-0 flex-1 flex-col items-start text-left">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Lightbulb className="h-4 w-4" />
                    Theme development
                  </div>
                  <div className="mt-1 text-xs font-normal leading-5 text-muted-foreground">
                    Turn reviewed groups into themes
                  </div>
                </div>
              </div>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="initial" className="mt-6">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-8">
                <section
                  ref={stage1ReviewRef}
                  className={`rounded-[24px] border bg-card p-6 shadow-sm transition-all ${highlightStage1Review ? "border-primary/60 ring-2 ring-primary/20" : "border-border"}`}
                >
                  <div className="mb-6 flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground">1</div>
                    <div>
                      <h3 className="font-heading text-xl text-foreground">Choose a transcript</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Stage 1 always starts with one interview at a time so the AI stays close to participant language.</p>
                    </div>
                  </div>

                  {transcripts.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-secondary/10 p-8">
                      <p className="text-base font-medium text-foreground">No transcripts uploaded yet</p>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Upload at least one interview in the transcripts area first. Once you have a transcript here, this page will guide you through the first AI coding pass.</p>
                      <Button className="mt-4" variant="outline" onClick={() => navigate(`/project/${projectId}/transcripts`)}>
                        <FileText className="mr-1.5 h-3.5 w-3.5" />
                        Go to transcripts
                      </Button>
                    </div>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {transcripts.map((transcript) => {
                        const isSelected = transcript.id === selectedTranscriptId;
                        const usage = usageRecords.find((row) => row.transcript_id === transcript.id && row.status !== "cancelled");
                        return (
                          <button
                            key={transcript.id}
                            type="button"
                            onClick={() => setSelectedTranscriptId(transcript.id)}
                            className={`rounded-2xl border px-4 py-4 text-left transition ${isSelected ? "border-primary bg-primary/8 shadow-sm ring-1 ring-primary/20" : "border-border bg-background hover:border-primary/35 hover:bg-secondary/10"}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-foreground">{transcript.participant_pseudonym}</p>
                                  {transcript.participant_code ? (
                                    <Badge variant="outline" className="text-[10px] font-mono">
                                      {transcript.participant_code}
                                    </Badge>
                                  ) : null}
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">{transcript.word_count?.toLocaleString() ?? 0} words</p>
                                <p className="mt-1 text-xs text-muted-foreground">About {estimateMinutes(transcript.word_count)} minutes</p>
                              </div>
                              {isSelected ? <div className="rounded-full bg-primary px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-foreground">Selected</div> : null}
                            </div>
                            {usage ? (
                              <div className="mt-4 inline-flex rounded-full border border-border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                {usage.usage_type === "free_trial" ? "Free sample reserved" : `${usage.credit_cost} paid credit${usage.credit_cost > 1 ? "s" : ""}`}
                              </div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="rounded-[24px] border border-primary/20 bg-gradient-to-br from-background via-secondary/10 to-primary/5 p-6 shadow-sm">
                  <div className="mb-6 flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-sm font-semibold text-secondary-foreground">2</div>
                    <div className="flex-1">
                      <h3 className="font-heading text-xl text-foreground">Generate the first AI pass</h3>
                      <p className="mt-1 text-sm text-muted-foreground">The AI reads only the transcript, not your research question or theory, so the first pass stays descriptive and grounded.</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border/70 bg-background/90 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Current transcript</p>
                          <div className="mt-2 flex items-center gap-2">
                            <p className="text-lg font-semibold text-foreground">{selectedTranscript ? selectedTranscript.participant_pseudonym : "Select a transcript"}</p>
                            {selectedTranscript?.participant_code ? (
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {selectedTranscript.participant_code}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {selectedTranscript ? `About ${currentTranscriptMinutes} minutes · ${selectedTranscript.word_count?.toLocaleString() ?? 0} words` : "Choose a transcript above to unlock this step."}
                          </p>
                        </div>
                        <Button onClick={() => void handleGenerateStage1()} disabled={!selectedTranscript || generating || transcriptLoading || !currentUserId}>
                          {generating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                          {stage1Items.length > 0 || acceptedStage1Items.length > 0 ? "Generate again" : "Generate initial codes"}
                        </Button>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {transcriptUsage ? (
                          <Badge variant="outline" className="bg-background">
                            {transcriptUsage.usage_type === "free_trial" ? "Using free sample" : `Uses ${transcriptUsage.credit_cost} paid credit${transcriptUsage.credit_cost > 1 ? "s" : ""}`}
                          </Badge>
                        ) : selectedTranscriptDecision ? (
                          selectedTranscriptDecision.eligible ? (
                            <Badge variant="secondary">
                              {selectedTranscriptDecision.usageType === "free_trial" ? "Eligible for free sample" : `Will use ${selectedTranscriptDecision.creditCost} paid credit${selectedTranscriptDecision.creditCost > 1 ? "s" : ""}`}
                            </Badge>
                          ) : (
                            <Badge variant="outline">{selectedTranscriptDecision.reason}</Badge>
                          )
                        ) : null}
                        {selectedRun && stage1Items.length > 0 ? <Badge variant="outline" className="bg-background">Latest run: {selectedRun.status}</Badge> : null}
                      </div>

                      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(260px,1.1fr)]">
                        <div className="rounded-2xl border border-dashed border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
                          Stage 1 is intentionally blind. This keeps the first pass closer to the participant&apos;s own language before we introduce broader project context in later steps.
                        </div>

                        <div className="rounded-2xl border border-border/70 bg-secondary/5 p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Transcript preview</p>
                            {selectedTranscript ? <span className="text-xs text-muted-foreground">Scrollable preview</span> : null}
                          </div>
                          {transcriptLoading ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Loading transcript workspace…
                            </div>
                          ) : selectedTranscript ? (
                            <div className="max-h-64 overflow-y-auto pr-2">
                              <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{selectedTranscript.content}</p>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">Choose a transcript from Step 1 to preview it here.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <section
                  ref={focusedReviewRef}
                  className={`rounded-[24px] border bg-card p-6 shadow-sm transition-all ${highlightFocusedReview ? "border-primary/60 ring-2 ring-primary/20" : "border-border"}`}
                >
                  <div className="mb-6 flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground text-sm font-semibold text-background">3</div>
                    <div className="flex-1">
                      <h3 className="font-heading text-xl text-foreground">Review and keep what fits</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Inspect the evidence, edit labels if needed, and only accepted items become real codes.</p>
                    </div>
                    {selectedRun ? (
                      <div className="rounded-2xl border border-border bg-secondary/10 px-4 py-3 text-right">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Review status</p>
                        <p className="mt-1 text-lg font-semibold text-foreground">{unresolvedCount}</p>
                        <p className="text-xs text-muted-foreground">suggestions left to review</p>
                      </div>
                    ) : null}
                  </div>

                    {selectedRun && stage1Items.length > 0 ? (
                      <div className="mb-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{toReadableDate(selectedRun.created_at)}</Badge>
                        <Badge variant="outline">{stage1Items.length} suggestions generated</Badge>
                      </div>
                    ) : null}

                  <div className="space-y-4">
                    {stage1Items.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border bg-secondary/10 p-8 text-sm text-muted-foreground">
                        No Stage 1 suggestions yet for this transcript. Complete Step 2 first, then the review cards will appear here with evidence and accept/reject actions.
                      </div>
                    ) : (
                      stage1Items.map((item, index) => {
                        const isAccepted = item.review_status === "accepted";
                        const isRejected = item.review_status === "rejected";
                        const isBusy = updatingItemId === item.id;

                        return (
                          <div key={item.id} className={`overflow-hidden rounded-[22px] border bg-background shadow-sm transition-all ${isAccepted ? "border-primary/35 ring-1 ring-primary/15" : isRejected ? "border-border/80" : "border-border"}`}>
                            <div className={`border-b px-5 py-4 ${isAccepted ? "border-primary/20 bg-primary/5" : "border-border/70 bg-secondary/10"}`}>
                              <div className="flex flex-wrap items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-background text-sm font-semibold text-foreground">{index + 1}</div>
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">AI suggestion</p>
                                  <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <Badge
                                      variant={isAccepted ? "secondary" : isRejected ? "outline" : "default"}
                                      className={isAccepted ? "bg-emerald-100 text-emerald-900 border-emerald-200 hover:bg-emerald-100" : undefined}
                                    >
                                      {isAccepted ? "Accepted" : isRejected ? "Rejected" : "Draft"}
                                    </Badge>
                                    {item.accepted_target_id ? (
                                      <Badge variant="outline" className="border-emerald-200 bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
                                        Saved to codebook
                                      </Badge>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                              <div className="space-y-4">
                                <div>
                                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Code label</label>
                                  <Input value={editedLabels[item.id] ?? item.label} onChange={(event) => setEditedLabels((current) => ({ ...current, [item.id]: event.target.value }))} disabled={isAccepted || isBusy} className="bg-background" />
                                </div>
                                {item.description ? (
                                  <div className="rounded-2xl bg-secondary/10 p-4">
                                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">What it captures</p>
                                    <p className="text-sm leading-6 text-foreground">{item.description}</p>
                                  </div>
                                ) : null}
                                {item.rationale ? (
                                  <div className="rounded-2xl bg-secondary/10 p-4">
                                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Why AI suggested it</p>
                                    <p className="text-sm leading-6 text-muted-foreground">{item.rationale}</p>
                                  </div>
                                ) : null}
                                {isRejected ? (
                                  <div className="rounded-2xl border border-border bg-secondary/10 px-4 py-3">
                                    <p className="text-sm font-semibold text-foreground">Rejected</p>
                                    <p className="mt-1 text-sm text-muted-foreground">This suggestion will not move forward into the codebook or the next AI step.</p>
                                  </div>
                                ) : !isAccepted ? (
                                  <div className="flex flex-wrap gap-2">
                                    <Button onClick={() => void handleAcceptItem(item)} disabled={isBusy}>
                                      {isBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                                      Accept as code
                                    </Button>
                                    <Button variant="outline" onClick={() => void handleRejectItem(item.id)} disabled={isBusy}>
                                      <X className="mr-1.5 h-3.5 w-3.5" />
                                      Reject
                                    </Button>
                                  </div>
                                ) : null}
                              </div>

                              <div className="space-y-3">
                                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Supporting evidence</p>
                                {item.evidence.length === 0 ? (
                                  <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">No quote evidence was saved for this suggestion.</div>
                                ) : (
                                  item.evidence.map((evidence) => (
                                    <div key={evidence.id} className="rounded-2xl border border-border/70 bg-secondary/10 p-4">
                                      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">"{evidence.transcript_excerpt}"</p>
                                      <p className="mt-3 text-xs text-muted-foreground">
                                        {evidence.start_index !== null && evidence.end_index !== null ? `Mapped to transcript characters ${evidence.start_index}-${evidence.end_index}` : "Quote saved without an exact character match"}
                                      </p>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>
              </div>

              <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
                <Card className="border-border/80 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Stage 1 at a glance</CardTitle>
                    <CardDescription>The secondary details live here so the main workflow stays clear.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div className="rounded-2xl bg-secondary/10 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">AI readiness</p>
                        <span className="text-xs text-muted-foreground">{setupChecks.filter((check) => check.ready).length}/{setupChecks.length} ready</span>
                      </div>
                      <div className="space-y-2">
                        {setupChecks.map((check) => (
                          <div key={check.label} className="flex items-center justify-between rounded-xl bg-background px-3 py-2">
                            <span className="text-foreground">{check.label}</span>
                            <Badge variant={check.ready ? "secondary" : "outline"}>{check.ready ? "Ready" : "Missing"}</Badge>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-xs leading-5 text-muted-foreground">Free sample limit: {entitlement?.max_minutes_free_trial ?? 60} min. Paid interview size: {entitlement?.max_minutes_per_paid_interview ?? 80} min.</p>
                    </div>

                    <div className="rounded-2xl bg-secondary/10 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Accepted in this run</p>
                        <span className="text-xs text-muted-foreground">{acceptedStage1Items.length}</span>
                      </div>
                      {acceptedStage1Items.length === 0 ? (
                        <p className="text-sm leading-6 text-muted-foreground">Accepted codes will appear here as you review suggestions, so you can keep track of what you&apos;ve already kept.</p>
                      ) : (
                        <div className="overflow-hidden rounded-xl border border-border bg-background">
                          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-border px-3 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                            <span>Code</span>
                            <span>Status</span>
                          </div>
                          <div className="max-h-56 overflow-y-auto">
                            {acceptedStage1Items.map((item) => (
                              <div key={`accepted-stage1-${item.id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 px-3 py-2 last:border-b-0">
                                <span className="text-sm font-medium text-foreground">{editedLabels[item.id] ?? item.label}</span>
                                <Badge className="border-emerald-200 bg-emerald-100 text-emerald-900 hover:bg-emerald-100">Accepted</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </aside>
            </div>
          </TabsContent>

          <TabsContent value="focused" className="mt-6">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-8">
                <section
                  ref={focusedReviewRef}
                  className={`rounded-[24px] border bg-card p-6 shadow-sm transition-all ${highlightFocusedReview ? "border-primary/60 ring-2 ring-primary/20" : "border-border"}`}
                >
                  <div className="mb-6 flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground">1</div>
                    <div className="flex-1">
                      <h3 className="font-heading text-xl text-foreground">Check Stage 1 readiness</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Focused grouping uses only accepted Stage 1 codes, and it works best once the first-pass review is finished.</p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-border bg-secondary/10 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Accepted initial codes</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{acceptedInitialCount}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-secondary/10 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Still in review</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{initialPendingCount}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-secondary/10 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Focused runs</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{runCounts.focused}</p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-dashed border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
                    Stage 2 preserves the original Stage 1 code labels. It only groups accepted codes into broader descriptive buckets; it does not create final themes yet.
                  </div>
                </section>

                <section className="rounded-[24px] border border-primary/20 bg-gradient-to-br from-background via-secondary/10 to-primary/5 p-6 shadow-sm">
                  <div className="mb-6 flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-sm font-semibold text-secondary-foreground">2</div>
                    <div className="flex-1">
                      <h3 className="font-heading text-xl text-foreground">Generate focused groups</h3>
                      <p className="mt-1 text-sm text-muted-foreground">AI looks across your accepted initial codes and suggests broader groups that can become categories.</p>
                    </div>
                    <Button onClick={() => void handleGenerateFocusedGrouping()} disabled={generatingFocused || focusedLoading || !currentUserId || !canGenerateFocused}>
                      {generatingFocused ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Layers3 className="mr-1.5 h-3.5 w-3.5" />}
                      {focusedRun ? "Generate again" : "Generate focused groups"}
                    </Button>
                  </div>

                  {!canGenerateFocused ? (
                    <div className="rounded-2xl border border-dashed border-border bg-background/80 p-5 text-sm text-muted-foreground">
                      {acceptedInitialCount < 3
                        ? "Accept at least 3 Stage 1 codes before generating focused groups."
                        : "Finish reviewing all Stage 1 draft suggestions before generating focused groups."}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-border/70 bg-background/90 p-5">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Ready inputs</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {acceptedInitialCodes.slice(0, 10).map((code) => (
                          <Badge key={code.item_id} variant="outline" className="bg-background">{code.label}</Badge>
                        ))}
                        {acceptedInitialCodes.length > 10 ? <Badge variant="outline" className="bg-background">+{acceptedInitialCodes.length - 10} more</Badge> : null}
                      </div>
                    </div>
                  )}
                </section>

                <section className="rounded-[24px] border border-border bg-card p-6 shadow-sm">
                  <div className="mb-6 flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground text-sm font-semibold text-background">3</div>
                    <div className="flex-1">
                      <h3 className="font-heading text-xl text-foreground">Review grouping suggestions</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Accept the groups that make sense, rename them if needed, and they will become categories in the project.</p>
                    </div>
                    {focusedRun ? (
                      <div className="rounded-2xl border border-border bg-secondary/10 px-4 py-3 text-right">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Review status</p>
                        <p className="mt-1 text-lg font-semibold text-foreground">{focusedUnresolvedCount}</p>
                        <p className="text-xs text-muted-foreground">groups left to review</p>
                      </div>
                    ) : null}
                  </div>

                  {focusedLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading focused grouping workspace…
                    </div>
                  ) : focusedItems.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-secondary/10 p-8 text-sm text-muted-foreground">
                      No focused grouping suggestions yet. Complete Steps 1 and 2 in this tab to generate project-level groupings from your accepted initial codes.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {focusedItems.map((item, index) => {
                        const isAccepted = item.review_status === "accepted";
                        const isRejected = item.review_status === "rejected";
                        const isBusy = updatingFocusedItemId === item.id;

                        return (
                          <div key={item.id} className="overflow-hidden rounded-[22px] border border-border bg-background shadow-sm">
                            <div className="border-b border-border/70 bg-secondary/10 px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-background text-sm font-semibold text-foreground">{index + 1}</div>
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Focused group</p>
                                  <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <Badge variant={isAccepted ? "secondary" : isRejected ? "outline" : "default"}>{isAccepted ? "Accepted" : isRejected ? "Rejected" : "Draft"}</Badge>
                                    {item.accepted_target_id ? <Badge variant="outline">Saved to categories</Badge> : null}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                              <div className="space-y-4">
                                <div>
                                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Category name</label>
                                  <Input value={focusedEditedLabels[item.id] ?? item.label} onChange={(event) => setFocusedEditedLabels((current) => ({ ...current, [item.id]: event.target.value }))} disabled={isAccepted || isBusy} className="bg-background" />
                                </div>
                                {item.description ? (
                                  <div className="rounded-2xl bg-secondary/10 p-4">
                                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">What this group captures</p>
                                    <p className="text-sm leading-6 text-foreground">{item.description}</p>
                                  </div>
                                ) : null}
                                <div className="rounded-2xl bg-secondary/10 p-4">
                                  <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Included initial codes</p>
                                  <div className="flex flex-wrap gap-2">
                                    {item.member_labels.map((label) => (
                                      <Badge key={`${item.id}-${label}`} variant="outline" className="bg-background">{label}</Badge>
                                    ))}
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Button onClick={() => void handleAcceptFocusedItem(item)} disabled={isAccepted || isBusy}>
                                    {isBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                                    Accept as category
                                  </Button>
                                  <Button variant="outline" onClick={() => void handleRejectFocusedItem(item.id)} disabled={isRejected || isBusy}>
                                    <X className="mr-1.5 h-3.5 w-3.5" />
                                    Reject
                                  </Button>
                                </div>
                              </div>

                              <div className="space-y-3">
                                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Supporting evidence</p>
                                {item.evidence.length === 0 ? (
                                  <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">No supporting quotes were saved for this grouping.</div>
                                ) : (
                                  item.evidence.map((evidence) => (
                                    <div key={evidence.id} className="rounded-2xl border border-border/70 bg-secondary/10 p-4">
                                      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">"{evidence.transcript_excerpt}"</p>
                                      <p className="mt-3 text-xs text-muted-foreground">{evidence.participant_pseudonym ? `Source: ${evidence.participant_pseudonym}` : "Supporting quote"}</p>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>

              <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
                <Card className="border-border/80 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Focused grouping at a glance</CardTitle>
                    <CardDescription>Use this after Stage 1 codes have been accepted.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-2xl bg-secondary/10 p-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Accepted</p>
                        <p className="mt-2 text-xl font-semibold text-foreground">{acceptedInitialCount}</p>
                        <p className="text-[11px] text-muted-foreground">codes</p>
                      </div>
                      <div className="rounded-2xl bg-secondary/10 p-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Pending</p>
                        <p className="mt-2 text-xl font-semibold text-foreground">{initialPendingCount}</p>
                        <p className="text-[11px] text-muted-foreground">stage 1</p>
                      </div>
                      <div className="rounded-2xl bg-secondary/10 p-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Groups</p>
                        <p className="mt-2 text-xl font-semibold text-foreground">{focusedItems.length}</p>
                        <p className="text-[11px] text-muted-foreground">suggested</p>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-secondary/10 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Stage guardrails</p>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between rounded-xl bg-background px-3 py-2">
                          <span className="text-foreground">Minimum accepted codes</span>
                          <Badge variant={acceptedInitialCount >= 3 ? "secondary" : "outline"}>{acceptedInitialCount >= 3 ? "Ready" : "Need 3+"}</Badge>
                        </div>
                        <div className="flex items-center justify-between rounded-xl bg-background px-3 py-2">
                          <span className="text-foreground">Stage 1 review complete</span>
                          <Badge variant={initialPendingCount === 0 ? "secondary" : "outline"}>{initialPendingCount === 0 ? "Ready" : "Pending"}</Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </aside>
            </div>
          </TabsContent>
          <TabsContent value="themes" className="mt-6">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-8">
                <section className="rounded-[24px] border border-border bg-card p-6 shadow-sm">
                  <div className="mb-6 flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-sm font-semibold text-primary-foreground">1</div>
                    <div className="flex-1">
                      <h3 className="font-heading text-xl text-foreground">Check theme-development readiness</h3>
                      <p className="mt-1 text-sm text-muted-foreground">This is the first stage that brings in your research question and broader framework, so it only opens after focused groups are reviewed.</p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="rounded-2xl border border-border bg-secondary/10 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Accepted groups</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{acceptedFocusedCount}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-secondary/10 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Still in review</p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{focusedPendingCount}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-secondary/10 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Research question</p>
                      <p className="mt-2 text-sm font-semibold text-foreground">{project?.research_question?.trim() ? "Present" : "Missing"}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-secondary/10 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Domain framework</p>
                      <p className="mt-2 text-sm font-semibold text-foreground">{project?.domain_framework?.trim() ? "Present" : "Missing"}</p>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-dashed border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
                    Stage 3 is where interpretation becomes more strategic. The AI can now use your research question, domain framework, approach, and reasoning mode to propose themes and subthemes grounded in your accepted groups.
                  </div>
                </section>

                <section className="rounded-[24px] border border-primary/20 bg-gradient-to-br from-background via-secondary/10 to-primary/5 p-6 shadow-sm">
                  <div className="mb-6 flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-sm font-semibold text-secondary-foreground">2</div>
                    <div className="flex-1">
                      <h3 className="font-heading text-xl text-foreground">Generate theme suggestions</h3>
                      <p className="mt-1 text-sm text-muted-foreground">AI looks across your accepted focused groups and proposes higher-level themes with optional subthemes.</p>
                    </div>
                    <Button onClick={() => void handleGenerateThemes()} disabled={generatingThemes || themesLoading || !currentUserId || !canGenerateThemes}>
                      {generatingThemes ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Lightbulb className="mr-1.5 h-3.5 w-3.5" />}
                      {themeRun ? "Generate again" : "Generate themes"}
                    </Button>
                  </div>

                  {!canGenerateThemes ? (
                    <div className="rounded-2xl border border-dashed border-border bg-background/80 p-5 text-sm text-muted-foreground">
                      {acceptedFocusedCount < 2
                        ? "Accept at least 2 focused groups before generating themes."
                        : focusedPendingCount > 0
                          ? "Finish reviewing all focused grouping drafts before generating themes."
                          : "Add both a research question and a domain framework to unlock theme development."}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-border/70 bg-background/90 p-5">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Ready focused groups</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {acceptedFocusedGroups.slice(0, 10).map((group) => (
                          <Badge key={group.item_id} variant="outline" className="bg-background">{group.label}</Badge>
                        ))}
                        {acceptedFocusedGroups.length > 10 ? <Badge variant="outline" className="bg-background">+{acceptedFocusedGroups.length - 10} more</Badge> : null}
                      </div>
                    </div>
                  )}
                </section>

                <section
                  ref={themeReviewRef}
                  className={`rounded-[24px] border bg-card p-6 shadow-sm transition-all ${highlightThemeReview ? "border-primary/60 ring-2 ring-primary/20" : "border-border"}`}
                >
                  <div className="mb-6 flex items-start gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-foreground text-sm font-semibold text-background">3</div>
                    <div className="flex-1">
                      <h3 className="font-heading text-xl text-foreground">Review theme suggestions</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Review the proposed themes, refine the names if needed, and only accept the ones that are truly helpful.</p>
                    </div>
                    {themeRun ? (
                      <div className="rounded-2xl border border-border bg-secondary/10 px-4 py-3 text-right">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Review status</p>
                        <p className="mt-1 text-lg font-semibold text-foreground">{themeUnresolvedCount}</p>
                        <p className="text-xs text-muted-foreground">themes left to review</p>
                      </div>
                    ) : null}
                  </div>

                  {themesLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading theme development workspace…
                    </div>
                  ) : themeItems.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-secondary/10 p-8 text-sm text-muted-foreground">
                      No theme suggestions yet. Complete Steps 1 and 2 in this tab to generate project-level themes from your accepted focused groups.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {themeItems.map((item, index) => {
                        const isAccepted = item.review_status === "accepted";
                        const isRejected = item.review_status === "rejected";
                        const isBusy = updatingThemeItemId === item.id;

                        return (
                          <div key={item.id} className="overflow-hidden rounded-[22px] border border-border bg-background shadow-sm">
                            <div className="border-b border-border/70 bg-secondary/10 px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-background text-sm font-semibold text-foreground">{index + 1}</div>
                                <div>
                                  <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Theme suggestion</p>
                                  <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <Badge variant={isAccepted ? "secondary" : isRejected ? "outline" : "default"}>{isAccepted ? "Accepted" : isRejected ? "Rejected" : "Draft"}</Badge>
                                    {item.accepted_target_id ? <Badge variant="outline">Saved to themes</Badge> : null}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                              <div className="space-y-4">
                                <div>
                                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Theme name</label>
                                  <Input value={themeEditedLabels[item.id] ?? item.label} onChange={(event) => setThemeEditedLabels((current) => ({ ...current, [item.id]: event.target.value }))} disabled={isAccepted || isBusy} className="bg-background" />
                                </div>
                                {item.description ? (
                                  <div className="rounded-2xl bg-secondary/10 p-4">
                                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">What this theme captures</p>
                                    <p className="text-sm leading-6 text-foreground">{item.description}</p>
                                  </div>
                                ) : null}
                                {item.rationale ? (
                                  <div className="rounded-2xl bg-secondary/10 p-4">
                                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Why AI suggested it</p>
                                    <p className="text-sm leading-6 text-muted-foreground">{item.rationale}</p>
                                  </div>
                                ) : null}
                                <div className="rounded-2xl bg-secondary/10 p-4">
                                  <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Built from focused groups</p>
                                  <div className="flex flex-wrap gap-2">
                                    {item.member_labels.map((label) => (
                                      <Badge key={`${item.id}-${label}`} variant="outline" className="bg-background">{label}</Badge>
                                    ))}
                                  </div>
                                </div>
                                {item.subthemes.length > 0 ? (
                                  <div className="rounded-2xl bg-secondary/10 p-4">
                                    <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Suggested subthemes</p>
                                    <div className="space-y-2">
                                      {item.subthemes.map((subtheme) => (
                                        <div key={`${item.id}-${subtheme.name}`} className="rounded-xl bg-background px-3 py-2">
                                          <p className="text-sm font-medium text-foreground">{subtheme.name}</p>
                                          {subtheme.description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{subtheme.description}</p> : null}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                                <div className="flex flex-wrap gap-2">
                                  <Button onClick={() => void handleAcceptThemeItem(item)} disabled={isAccepted || isBusy}>
                                    {isBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                                    Accept as theme
                                  </Button>
                                  <Button variant="outline" onClick={() => void handleRejectThemeItem(item.id)} disabled={isRejected || isBusy}>
                                    <X className="mr-1.5 h-3.5 w-3.5" />
                                    Reject
                                  </Button>
                                </div>
                              </div>

                              <div className="space-y-3">
                                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Supporting evidence</p>
                                {item.evidence.length === 0 ? (
                                  <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">No supporting quotes were saved for this theme.</div>
                                ) : (
                                  item.evidence.map((evidence) => (
                                    <div key={evidence.id} className="rounded-2xl border border-border/70 bg-secondary/10 p-4">
                                      <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">"{evidence.transcript_excerpt}"</p>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>

              <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
                <Card className="border-border/80 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Theme development at a glance</CardTitle>
                    <CardDescription>This is where the AI connects your reviewed coding back to your study.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-2xl bg-secondary/10 p-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Accepted</p>
                        <p className="mt-2 text-xl font-semibold text-foreground">{acceptedFocusedCount}</p>
                        <p className="text-[11px] text-muted-foreground">groups</p>
                      </div>
                      <div className="rounded-2xl bg-secondary/10 p-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Pending</p>
                        <p className="mt-2 text-xl font-semibold text-foreground">{focusedPendingCount}</p>
                        <p className="text-[11px] text-muted-foreground">stage 2</p>
                      </div>
                      <div className="rounded-2xl bg-secondary/10 p-3">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Themes</p>
                        <p className="mt-2 text-xl font-semibold text-foreground">{themeItems.length}</p>
                        <p className="text-[11px] text-muted-foreground">suggested</p>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-secondary/10 p-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Stage guardrails</p>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between rounded-xl bg-background px-3 py-2">
                          <span className="text-foreground">Minimum accepted groups</span>
                          <Badge variant={acceptedFocusedCount >= 2 ? "secondary" : "outline"}>{acceptedFocusedCount >= 2 ? "Ready" : "Need 2+"}</Badge>
                        </div>
                        <div className="flex items-center justify-between rounded-xl bg-background px-3 py-2">
                          <span className="text-foreground">Stage 2 review complete</span>
                          <Badge variant={focusedPendingCount === 0 ? "secondary" : "outline"}>{focusedPendingCount === 0 ? "Ready" : "Pending"}</Badge>
                        </div>
                        <div className="flex items-center justify-between rounded-xl bg-background px-3 py-2">
                          <span className="text-foreground">Research context present</span>
                          <Badge variant={project?.research_question?.trim() && project?.domain_framework?.trim() ? "secondary" : "outline"}>
                            {project?.research_question?.trim() && project?.domain_framework?.trim() ? "Ready" : "Missing"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </aside>
            </div>
          </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default AIAnalysis;
