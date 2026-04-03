
-- Canvas nodes table
CREATE TABLE public.canvas_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  node_type TEXT NOT NULL,
  label TEXT NOT NULL,
  linked_id UUID,
  position_x FLOAT DEFAULT 100,
  position_y FLOAT DEFAULT 100,
  width FLOAT,
  height FLOAT,
  created_by TEXT,
  ai_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Canvas edges table
CREATE TABLE public.canvas_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  source_node_id UUID REFERENCES public.canvas_nodes(id) ON DELETE CASCADE NOT NULL,
  target_node_id UUID REFERENCES public.canvas_nodes(id) ON DELETE CASCADE NOT NULL,
  relationship TEXT,
  created_by TEXT,
  rival_evidence BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Validation triggers
CREATE OR REPLACE FUNCTION public.validate_canvas_node()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.node_type NOT IN ('code','category','theme','proposition') THEN
    RAISE EXCEPTION 'Invalid node_type: %', NEW.node_type;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_canvas_node_trigger
  BEFORE INSERT OR UPDATE ON public.canvas_nodes
  FOR EACH ROW EXECUTE FUNCTION public.validate_canvas_node();

CREATE OR REPLACE FUNCTION public.validate_canvas_edge()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.relationship IS NOT NULL AND NEW.relationship NOT IN ('leads_to','contradicts','is_part_of','enables','extends','challenges','fills_gap','replicates') THEN
    RAISE EXCEPTION 'Invalid relationship: %', NEW.relationship;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_canvas_edge_trigger
  BEFORE INSERT OR UPDATE ON public.canvas_edges
  FOR EACH ROW EXECUTE FUNCTION public.validate_canvas_edge();

-- RLS
ALTER TABLE public.canvas_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view canvas nodes" ON public.canvas_nodes
  FOR SELECT TO authenticated
  USING (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can insert canvas nodes" ON public.canvas_nodes
  FOR INSERT TO authenticated
  WITH CHECK (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can update canvas nodes" ON public.canvas_nodes
  FOR UPDATE TO authenticated
  USING (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can delete canvas nodes" ON public.canvas_nodes
  FOR DELETE TO authenticated
  USING (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can view canvas edges" ON public.canvas_edges
  FOR SELECT TO authenticated
  USING (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can insert canvas edges" ON public.canvas_edges
  FOR INSERT TO authenticated
  WITH CHECK (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can update canvas edges" ON public.canvas_edges
  FOR UPDATE TO authenticated
  USING (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can delete canvas edges" ON public.canvas_edges
  FOR DELETE TO authenticated
  USING (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.canvas_nodes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.canvas_edges;
