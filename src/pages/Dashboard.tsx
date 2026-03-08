import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchProjects, type Project } from "@/lib/supabase-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, LogOut, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const statusDot: Record<string, string> = {
  setup: "bg-muted-foreground",
  in_progress: "bg-primary",
  complete: "bg-success",
};

const statusLabel: Record<string, string> = {
  setup: "SETUP",
  in_progress: "IN PROGRESS",
  complete: "COMPLETE",
};

const approachLabels: Record<string, string> = {
  grounded: "GROUNDED",
  content: "CONTENT",
  template: "TEMPLATE",
};

const Dashboard = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      loadProjects();
    };
    checkAuth();
  }, [navigate]);

  const loadProjects = async () => {
    try {
      const data = await fetchProjects();
      setProjects(data);
    } catch (error: any) {
      toast.error("Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-8 py-4">
          <h1 className="font-heading text-xl text-foreground">
            QualCode AI
          </h1>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-[1200px] px-8 py-10">
        <div className="mb-8">
          <h2 className="font-heading text-2xl text-foreground">
            Projects
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your qualitative research projects
          </p>
        </div>

        {/* New Project button - full width dashed */}
        <button
          onClick={() => navigate("/project/new")}
          className="mb-6 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border py-3 text-[13px] font-medium tracking-wide-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Plus className="h-4 w-4" />
          New Project
        </button>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg border border-border bg-card" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-16 text-center">
            <p className="text-sm text-muted-foreground">
              No projects yet. Create your first research project.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {projects.map((project) => (
              <button
                key={project.id}
                className="flex w-full items-center gap-4 rounded-lg border border-border bg-card px-6 py-4 text-left transition-colors hover:bg-secondary"
                onClick={() => navigate(`/project/${project.id}/transcripts`)}
              >
                {/* Title */}
                <span className="flex-1 font-heading text-lg text-foreground">
                  {project.title}
                </span>

                {/* Approach badge */}
                {project.approach && (
                  <Badge variant="outline">
                    {approachLabels[project.approach]}
                  </Badge>
                )}

                {/* Status dot + label */}
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${statusDot[project.status]}`} />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {statusLabel[project.status]}
                  </span>
                </div>

                {/* Date */}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {format(new Date(project.created_at), "MMM d, yyyy")}
                </span>

                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
