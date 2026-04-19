import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  NodeTypes,
  EdgeTypes,
  Panel,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  NodeChange,
  Handle,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Layers, Eye, EyeOff, LayoutGrid, Plus, Download, Lightbulb,
  BookOpen, StickyNote, BookMarked, FileText, Network, ChevronRight, X, AlertTriangle
} from "lucide-react";
import { toast } from "sonner";

// ── Types ──
type CanvasNodeRow = {
  id: string; project_id: string; node_type: string; label: string;
  linked_id: string | null; position_x: number; position_y: number;
  width: number | null; height: number | null; created_by: string | null;
  ai_generated: boolean; created_at: string; updated_at: string;
};
type CanvasEdgeRow = {
  id: string; project_id: string; source_node_id: string; target_node_id: string;
  relationship: string | null; created_by: string | null; rival_evidence: boolean;
  created_at: string;
};
type CodeRow = {
  id: string; label: string; definition: string | null; cycle: string | null;
  color: string | null; created_by: string | null; parent_code_id: string | null;
};
type PropositionRow = {
  id: string; statement: string; confidence: string | null; status: string;
  rival_evidence: any; supporting_codes: string[] | null;
};
type CodeAppRow = {
  id: string; code_id: string; segment_text: string;
};

// ── Relationship styles ──
const REL_STYLES: Record<string, { stroke: string; strokeDasharray?: string }> = {
  leads_to:    { stroke: "hsl(172 83% 33%)" },
  enables:     { stroke: "hsl(172 83% 33%)" },
  extends:     { stroke: "hsl(172 83% 33%)" },
  contradicts: { stroke: "hsl(0 85% 60%)", strokeDasharray: "8 4" },
  challenges:  { stroke: "hsl(0 85% 60%)", strokeDasharray: "8 4" },
  fills_gap:   { stroke: "hsl(40 73% 49%)", strokeDasharray: "4 4" },
  is_part_of:  { stroke: "hsl(215 10% 55%)" },
  replicates:  { stroke: "hsl(215 10% 55%)" },
};

const REL_OPTIONS = ["leads_to","contradicts","is_part_of","enables","extends","challenges","fills_gap","replicates"];

// ── Custom Node Components ──
function CodeNode({ data }: { data: any }) {
  const size = Math.max(32, Math.min(80, 32 + (data.frequency || 0) * 4));
  const color = data.color || "hsl(172 83% 33%)";
  const saturation = Math.min(100, (data.frequency || 0) * 10);
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <Handle type="target" position={Position.Top} className="!bg-primary !w-2 !h-2" />
      {/* Saturation ring */}
      <svg className="absolute inset-0" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="46" fill="none" stroke="hsl(220 10% 24%)" strokeWidth="4" />
        <circle cx="50" cy="50" r="46" fill="none" stroke="hsl(140 50% 48%)" strokeWidth="4"
          strokeDasharray={`${saturation * 2.89} ${289 - saturation * 2.89}`}
          strokeDashoffset="72" strokeLinecap="round" />
      </svg>
      <div className="rounded-full flex items-center justify-center z-10 text-center"
        style={{
          width: size - 8, height: size - 8, backgroundColor: color,
          fontSize: Math.max(9, 11 - Math.max(0, data.label.length - 12)), lineHeight: "1.1",
        }}>
        <span className="text-white font-mono px-1 truncate" style={{ maxWidth: size - 12 }}>
          {data.label}
        </span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-2 !h-2" />
    </div>
  );
}

function CategoryNode({ data }: { data: any }) {
  return (
    <div className="rounded-lg border-2 border-primary px-4 py-3 min-w-[140px]"
      style={{ backgroundColor: "hsl(220 18% 13%)" }}>
      <Handle type="target" position={Position.Top} className="!bg-primary !w-2 !h-2" />
      <p className="text-base text-foreground" style={{ fontFamily: "var(--font-heading)" }}>
        {data.label}
      </p>
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-2 !h-2" />
    </div>
  );
}

function ThemeNode({ data }: { data: any }) {
  return (
    <div className="rounded-lg border-2 px-5 py-4 min-w-[180px]"
      style={{ backgroundColor: "hsl(220 18% 13%)", borderColor: "hsl(40 73% 49%)" }}>
      <Handle type="target" position={Position.Top} className="!bg-warning !w-2 !h-2" />
      <p className="text-lg" style={{ fontFamily: "var(--font-heading)", color: "hsl(40 73% 49%)" }}>
        {data.label}
      </p>
      <Handle type="source" position={Position.Bottom} className="!bg-warning !w-2 !h-2" />
    </div>
  );
}

function PropositionNode({ data }: { data: any }) {
  const hasRival = data.hasRivalEvidence;
  return (
    <div className="relative" style={{ transform: "rotate(45deg)" }}>
      <Handle type="target" position={Position.Top} className="!bg-yellow-600 !w-2 !h-2" />
      <div className="rounded-sm border-[3px] w-[120px] h-[120px] flex items-center justify-center"
        style={{ backgroundColor: "hsl(220 18% 13%)", borderColor: "#D4A017" }}>
        <div style={{ transform: "rotate(-45deg)", maxWidth: 100 }}>
          <p className="text-[13px] text-foreground text-center line-clamp-3"
            style={{ fontFamily: "var(--font-heading)" }}>
            {data.label}
          </p>
        </div>
      </div>
      {hasRival && (
        <div className="absolute -top-2 -right-2 bg-destructive rounded-full w-5 h-5 flex items-center justify-center"
          style={{ transform: "rotate(-45deg)" }}>
          <AlertTriangle className="w-3 h-3 text-white" />
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-yellow-600 !w-2 !h-2" />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  code: CodeNode,
  category: CategoryNode,
  theme: ThemeNode,
  proposition: PropositionNode,
};

// ── Main Canvas (inner, needs ReactFlowProvider wrapper) ──
function CanvasInner() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const reactFlowInstance = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [canvasNodesDb, setCanvasNodesDb] = useState<CanvasNodeRow[]>([]);
  const [canvasEdgesDb, setCanvasEdgesDb] = useState<CanvasEdgeRow[]>([]);
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [propositions, setPropositions] = useState<PropositionRow[]>([]);
  const [codeApps, setCodeApps] = useState<CodeAppRow[]>([]);

  // Visibility toggles
  const [showCodes, setShowCodes] = useState(true);
  const [showCategories, setShowCategories] = useState(true);
  const [showThemes, setShowThemes] = useState(true);
  const [showPropositions, setShowPropositions] = useState(true);
  const [viewMode, setViewMode] = useState<"combined" | "mine" | "partner">("combined");

  // Dialogs
  const [addThemeOpen, setAddThemeOpen] = useState(false);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [edgeDialogOpen, setEdgeDialogOpen] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);
  const [selectedRelationship, setSelectedRelationship] = useState("leads_to");

  // Detail panel
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const posUpdateTimeout = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── Load data ──
  const loadData = useCallback(async () => {
    if (!projectId) return;
    const [nodesRes, edgesRes, codesRes, propsRes, appsRes] = await Promise.all([
      supabase.from("canvas_nodes").select("*").eq("project_id", projectId),
      supabase.from("canvas_edges").select("*").eq("project_id", projectId),
      supabase.from("codes").select("id,label,definition,cycle,color,created_by,parent_code_id").eq("project_id", projectId),
      supabase.from("theory_propositions").select("id,statement,confidence,status,rival_evidence,supporting_codes").eq("project_id", projectId),
      supabase.from("code_applications").select("id,code_id,segment_text").limit(500),
    ]);
    setCanvasNodesDb(nodesRes.data || []);
    setCanvasEdgesDb(edgesRes.data || []);
    setCodes(codesRes.data || []);
    setPropositions(propsRes.data || []);
    setCodeApps(appsRes.data || []);
  }, [projectId]);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      loadData();
    };
    init();
  }, [navigate, loadData]);

  // ── Sync codes & propositions to canvas_nodes (auto-populate) ──
  useEffect(() => {
    if (!projectId || !codes.length) return;
    const existingLinkedIds = new Set(canvasNodesDb.map(n => n.linked_id));
    const missingCodes = codes.filter(c => !existingLinkedIds.has(c.id));
    const missingProps = propositions.filter(p => p.status === "accepted" && !existingLinkedIds.has(p.id));

    const toInsert: any[] = [];
    missingCodes.forEach((c, i) => {
      toInsert.push({
        project_id: projectId, node_type: "code", label: c.label, linked_id: c.id,
        position_x: 100 + (i % 8) * 120, position_y: 400 + Math.floor(i / 8) * 120,
      });
    });
    missingProps.forEach((p, i) => {
      toInsert.push({
        project_id: projectId, node_type: "proposition", label: p.statement.slice(0, 80),
        linked_id: p.id, position_x: 300 + i * 200, position_y: 50,
      });
    });

    if (toInsert.length > 0) {
      supabase.from("canvas_nodes").insert(toInsert).then(() => loadData());
    }
  }, [codes, propositions, canvasNodesDb, projectId, loadData]);

  // ── Build React Flow nodes & edges from DB state ──
  useEffect(() => {
    const codeFreq: Record<string, number> = {};
    codeApps.forEach(a => { codeFreq[a.code_id] = (codeFreq[a.code_id] || 0) + 1; });

    const codeMap = Object.fromEntries(codes.map(c => [c.id, c]));
    const propMap = Object.fromEntries(propositions.map(p => [p.id, p]));

    const visibility: Record<string, boolean> = {
      code: showCodes, category: showCategories, theme: showThemes, proposition: showPropositions,
    };

    const rfNodes: Node[] = canvasNodesDb
      .filter(n => visibility[n.node_type] !== false)
      .map(n => {
        const code = n.linked_id ? codeMap[n.linked_id] : null;
        const prop = n.linked_id ? propMap[n.linked_id] : null;
        return {
          id: n.id,
          type: n.node_type,
          position: { x: n.position_x, y: n.position_y },
          data: {
            label: n.label,
            color: code?.color || undefined,
            frequency: n.linked_id ? (codeFreq[n.linked_id] || 0) : 0,
            hasRivalEvidence: prop?.rival_evidence ? true : false,
            nodeType: n.node_type,
            linkedId: n.linked_id,
            code, prop,
          },
        };
      });

    const rfEdges: Edge[] = canvasEdgesDb.map(e => {
      const style = REL_STYLES[e.relationship || "is_part_of"] || REL_STYLES.is_part_of;
      return {
        id: e.id,
        source: e.source_node_id,
        target: e.target_node_id,
        label: e.relationship?.replace(/_/g, " ") || "",
        style: { stroke: style.stroke, strokeWidth: 2, strokeDasharray: style.strokeDasharray },
        labelStyle: { fill: style.stroke, fontSize: 10, fontFamily: "var(--font-mono)" },
        labelBgStyle: { fill: "hsl(220 18% 13%)", fillOpacity: 0.9 },
        labelBgPadding: [4, 2] as [number, number],
      };
    });

    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [canvasNodesDb, canvasEdgesDb, codes, propositions, codeApps, showCodes, showCategories, showThemes, showPropositions]);

  // ── Handle node drag end → save position ──
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    onNodesChange(changes);
    changes.forEach(change => {
      if (change.type === "position" && change.position && !change.dragging) {
        const nodeId = change.id;
        // Debounce position save
        if (posUpdateTimeout.current[nodeId]) clearTimeout(posUpdateTimeout.current[nodeId]);
        posUpdateTimeout.current[nodeId] = setTimeout(() => {
          supabase.from("canvas_nodes").update({
            position_x: change.position!.x, position_y: change.position!.y,
          }).eq("id", nodeId).then();
        }, 300);
      }
    });
  }, [onNodesChange]);

  // ── Handle edge connection ──
  const onConnect = useCallback((connection: Connection) => {
    setPendingConnection(connection);
    setSelectedRelationship("leads_to");
    setEdgeDialogOpen(true);
  }, []);

  const confirmEdge = async () => {
    if (!pendingConnection || !projectId) return;
    const { error } = await supabase.from("canvas_edges").insert({
      project_id: projectId,
      source_node_id: pendingConnection.source,
      target_node_id: pendingConnection.target,
      relationship: selectedRelationship,
    });
    if (error) { toast.error("Failed to create edge"); return; }
    setEdgeDialogOpen(false);
    setPendingConnection(null);
    loadData();
  };

  // ── Add theme / category ──
  const addNode = async (type: "theme" | "category") => {
    if (!newLabel.trim() || !projectId) return;
    const { error } = await supabase.from("canvas_nodes").insert({
      project_id: projectId, node_type: type, label: newLabel.trim(),
      position_x: 300 + Math.random() * 200, position_y: type === "theme" ? 100 : 250,
    });
    if (error) { toast.error("Failed to create node"); return; }
    setNewLabel("");
    if (type === "theme") setAddThemeOpen(false);
    else setAddCategoryOpen(false);
    loadData();
    toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} added`);
  };

  // ── Auto-layout ──
  const autoLayout = useCallback(() => {
    const typeOrder: Record<string, number> = { proposition: 0, theme: 1, category: 2, code: 3 };
    const grouped: Record<number, CanvasNodeRow[]> = {};
    canvasNodesDb.forEach(n => {
      const tier = typeOrder[n.node_type] ?? 3;
      if (!grouped[tier]) grouped[tier] = [];
      grouped[tier].push(n);
    });

    const updates: PromiseLike<any>[] = [];
    Object.entries(grouped).forEach(([tier, nodes]) => {
      const y = Number(tier) * 200 + 50;
      nodes.forEach((n, i) => {
        const x = 80 + i * 160;
        updates.push(supabase.from("canvas_nodes").update({ position_x: x, position_y: y }).eq("id", n.id) as PromiseLike<any>);
      });
    });
    Promise.all(updates).then(() => { loadData(); toast.success("Layout applied"); });
  }, [canvasNodesDb, loadData]);

  // ── Export PNG ──
  const exportPng = useCallback(() => {
    const el = document.querySelector(".react-flow__viewport") as HTMLElement;
    if (!el) return;
    import("reactflow").then(() => {
      toast.info("Use your browser's screenshot tool or a library like html-to-image for export.");
    });
  }, []);

  // ── Node double-click → detail panel ──
  const onNodeDoubleClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node.data);
    setDetailOpen(true);
  }, []);

  // ── Realtime subscriptions ──
  useEffect(() => {
    if (!projectId) return;
    const channel = supabase.channel(`canvas-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "canvas_nodes", filter: `project_id=eq.${projectId}` }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "canvas_edges", filter: `project_id=eq.${projectId}` }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, loadData]);

  // ── Nav links ──
  const navItems = [
    { label: "Transcripts", icon: FileText, path: `/project/${projectId}/transcripts` },
    { label: "Codebook", icon: BookOpen, path: `/project/${projectId}/codebook` },
    { label: "Memos", icon: StickyNote, path: `/project/${projectId}/memos` },
    { label: "Literature", icon: BookMarked, path: `/project/${projectId}/literature` },
    { label: "Theory", icon: Lightbulb, path: `/project/${projectId}/theory` },
    { label: "Canvas", icon: Network, path: `/project/${projectId}/canvas`, active: true },
    { label: "AI Analysis", icon: Sparkles, path: `/project/${projectId}/ai-analysis` },
  ];

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm text-muted-foreground font-mono">VISUAL THEORY CANVAS</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          {navItems.map(item => (
            <Button key={item.label} variant={item.active ? "secondary" : "ghost"} size="sm"
              onClick={() => navigate(item.path)}>
              <item.icon className="mr-1.5 h-3.5 w-3.5" />
              {item.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={onNodeDoubleClick}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="hsl(220 10% 20%)" />
          <Controls className="!bg-card !border-border !shadow-lg [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground" />
          <MiniMap
            className="!bg-card !border-border"
            nodeColor={(n) => {
              if (n.type === "code") return "hsl(172 83% 33%)";
              if (n.type === "category") return "hsl(172 83% 40%)";
              if (n.type === "theme") return "hsl(40 73% 49%)";
              if (n.type === "proposition") return "#D4A017";
              return "hsl(215 10% 55%)";
            }}
          />

          {/* Floating Toolbar */}
          <Panel position="top-center">
            <div className="flex items-center gap-2 bg-card/95 backdrop-blur border border-border rounded-lg px-3 py-2 shadow-lg">
              {/* Layer toggles */}
              <div className="flex items-center gap-1 border-r border-border pr-2">
                <Button variant={showCodes ? "secondary" : "ghost"} size="sm"
                  onClick={() => setShowCodes(!showCodes)} className="text-xs h-7 px-2">
                  {showCodes ? <Eye className="w-3 h-3 mr-1" /> : <EyeOff className="w-3 h-3 mr-1" />}
                  Codes
                </Button>
                <Button variant={showCategories ? "secondary" : "ghost"} size="sm"
                  onClick={() => setShowCategories(!showCategories)} className="text-xs h-7 px-2">
                  {showCategories ? <Eye className="w-3 h-3 mr-1" /> : <EyeOff className="w-3 h-3 mr-1" />}
                  Categories
                </Button>
                <Button variant={showThemes ? "secondary" : "ghost"} size="sm"
                  onClick={() => setShowThemes(!showThemes)} className="text-xs h-7 px-2">
                  {showThemes ? <Eye className="w-3 h-3 mr-1" /> : <EyeOff className="w-3 h-3 mr-1" />}
                  Themes
                </Button>
                <Button variant={showPropositions ? "secondary" : "ghost"} size="sm"
                  onClick={() => setShowPropositions(!showPropositions)} className="text-xs h-7 px-2">
                  {showPropositions ? <Eye className="w-3 h-3 mr-1" /> : <EyeOff className="w-3 h-3 mr-1" />}
                  Props
                </Button>
              </div>

              {/* View mode */}
              <div className="flex items-center gap-1 border-r border-border pr-2">
                {(["combined", "mine", "partner"] as const).map(m => (
                  <Button key={m} variant={viewMode === m ? "secondary" : "ghost"} size="sm"
                    onClick={() => setViewMode(m)} className="text-xs h-7 px-2 capitalize">
                    {m === "mine" ? "My view" : m === "partner" ? "Partner" : "Combined"}
                  </Button>
                ))}
              </div>

              {/* Actions */}
              <Button variant="ghost" size="sm" onClick={autoLayout} className="text-xs h-7 px-2">
                <LayoutGrid className="w-3 h-3 mr-1" /> Auto-layout
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setNewLabel(""); setAddCategoryOpen(true); }} className="text-xs h-7 px-2">
                <Plus className="w-3 h-3 mr-1" /> Category
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setNewLabel(""); setAddThemeOpen(true); }} className="text-xs h-7 px-2">
                <Plus className="w-3 h-3 mr-1" /> Theme
              </Button>
              <Button variant="ghost" size="sm" onClick={exportPng} className="text-xs h-7 px-2">
                <Download className="w-3 h-3 mr-1" /> PNG
              </Button>
            </div>
          </Panel>

          {/* Legend */}
          <Panel position="bottom-left">
            <div className="bg-card/90 backdrop-blur border border-border rounded-lg p-3 text-xs space-y-1.5">
              <p className="font-mono text-muted-foreground mb-1">EDGE TYPES</p>
              <div className="flex items-center gap-2"><div className="w-6 h-0 border-t-2" style={{ borderColor: "hsl(172 83% 33%)" }} /> <span>leads_to / enables / extends</span></div>
              <div className="flex items-center gap-2"><div className="w-6 h-0 border-t-2 border-dashed" style={{ borderColor: "hsl(0 85% 60%)" }} /> <span>contradicts / challenges</span></div>
              <div className="flex items-center gap-2"><div className="w-6 h-0 border-t-2 border-dotted" style={{ borderColor: "hsl(40 73% 49%)" }} /> <span>fills_gap</span></div>
              <div className="flex items-center gap-2"><div className="w-6 h-0 border-t-2" style={{ borderColor: "hsl(215 10% 55%)" }} /> <span>is_part_of / replicates</span></div>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Edge relationship dialog */}
      <Dialog open={edgeDialogOpen} onOpenChange={setEdgeDialogOpen}>
        <DialogContent className="sm:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">Select relationship type</DialogTitle>
          </DialogHeader>
          <Select value={selectedRelationship} onValueChange={setSelectedRelationship}>
            <SelectTrigger className="bg-input border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REL_OPTIONS.map(r => (
                <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={confirmEdge} className="w-full">Create Edge</Button>
        </DialogContent>
      </Dialog>

      {/* Add Theme dialog */}
      <Dialog open={addThemeOpen} onOpenChange={setAddThemeOpen}>
        <DialogContent className="sm:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">Add Theme</DialogTitle>
          </DialogHeader>
          <Input placeholder="Theme name" value={newLabel} onChange={e => setNewLabel(e.target.value)}
            className="bg-input border-border" />
          <Button onClick={() => addNode("theme")} className="w-full">Add Theme</Button>
        </DialogContent>
      </Dialog>

      {/* Add Category dialog */}
      <Dialog open={addCategoryOpen} onOpenChange={setAddCategoryOpen}>
        <DialogContent className="sm:max-w-sm bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">Add Category</DialogTitle>
          </DialogHeader>
          <Input placeholder="Category name" value={newLabel} onChange={e => setNewLabel(e.target.value)}
            className="bg-input border-border" />
          <Button onClick={() => addNode("category")} className="w-full">Add Category</Button>
        </DialogContent>
      </Dialog>

      {/* Node detail panel */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg bg-card border-border max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-heading)" }}>{selectedNode?.label}</DialogTitle>
          </DialogHeader>
          {selectedNode?.code && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground font-mono text-xs mb-1">DEFINITION</p>
                <p>{selectedNode.code.definition || "No definition set"}</p>
              </div>
              <div>
                <p className="text-muted-foreground font-mono text-xs mb-1">CYCLE</p>
                <Badge variant="outline">{selectedNode.code.cycle || "first"}</Badge>
              </div>
              <div>
                <p className="text-muted-foreground font-mono text-xs mb-1">CODED SEGMENTS ({selectedNode.frequency})</p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {codeApps.filter(a => a.code_id === selectedNode.linkedId).slice(0, 10).map(a => (
                    <p key={a.id} className="text-xs bg-secondary p-2 rounded italic">"{a.segment_text}"</p>
                  ))}
                </div>
              </div>
            </div>
          )}
          {selectedNode?.prop && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground font-mono text-xs mb-1">FULL STATEMENT</p>
                <p>{selectedNode.prop.statement}</p>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline">{selectedNode.prop.confidence}</Badge>
                <Badge variant="outline">{selectedNode.prop.status}</Badge>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate(`/project/${projectId}/theory`)}>
                Open in Theory screen <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </div>
          )}
          {!selectedNode?.code && !selectedNode?.prop && (
            <p className="text-sm text-muted-foreground">
              {selectedNode?.nodeType === "theme" ? "Theme node" : "Category node"} — drag codes into this group.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Wrapper with ReactFlowProvider ──
export default function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
