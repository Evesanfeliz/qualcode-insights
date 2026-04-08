import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { deleteProject, fetchProjects, type Project } from "@/lib/supabase-helpers";
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
import { Button } from "@/components/ui/button";
import { Plus, LogOut, ChevronRight, FolderOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useOnboarding } from "@/hooks/useOnboarding";
import { AppTour } from "@/components/AppTour";

const statusConfig: Record<string, { dot: string; label: string }> = {
  setup: { dot: "bg-muted-foreground", label: "Setup" },
  in_progress: { dot: "bg-primary", label: "Active" },
  complete: { dot: "bg-success", label: "Complete" },
};

const approachLabels: Record<string, string> = {
  grounded: "Grounded Theory",
  content: "Content Analysis",
  template: "Template",
};

const Dashboard = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { progress, loading: onboardingLoading } = useOnboarding();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const shouldTour = searchParams.get("tour") === "true";

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      setCurrentUserId(session.user.id);

      // Check onboarding
      const { data } = await supabase
        .from("onboarding_progress" as any)
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!data) {
        navigate("/onboarding/welcome");
        return;
      }

      const p = data as any;
      if (!p.welcome_completed) {
        navigate("/onboarding/welcome");
        return;
      }
      if (!p.practice_completed) {
        navigate("/onboarding/practice");
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

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;

    try {
      setDeletingProjectId(projectToDelete.id);
      await deleteProject(projectToDelete.id);
      setProjects((current) => current.filter((project) => project.id !== projectToDelete.id));
      toast.success("Project deleted");
      setProjectToDelete(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to delete project");
    } finally {
      setDeletingProjectId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppTour autoStart={shouldTour && !progress?.tour_completed} projectId={projects[0]?.id} />
      <AlertDialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              {projectToDelete
                ? `This will permanently delete "${projectToDelete.title}" and its related research data.`
                : "This will permanently delete this project and its related research data."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingProjectId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProject}
              disabled={!!deletingProjectId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingProjectId ? "Deleting..." : "Delete Project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[960px] items-center justify-between px-8 py-5">
          <div>
            <h1 className="font-heading text-2xl text-foreground leading-none">QualCode</h1>
            <p className="text-xs text-muted-foreground mt-1 font-body">Qualitative Research Tool</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground">
            <LogOut className="mr-2 h-3.5 w-3.5" />
            Sign out
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-[960px] px-8 py-10">
        {/* Section header */}
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="font-heading text-3xl text-foreground">Projects</h2>
            <p className="mt-1.5 text-sm text-muted-foreground font-body">
              {projects.length} research project{projects.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Button onClick={() => navigate("/project/new")} size="sm" className="gap-2">
            <Plus className="h-3.5 w-3.5" />
            New Project
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[72px] animate-pulse rounded-lg border border-border bg-card" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card py-20 text-center">
            <FolderOpen className="mx-auto h-10 w-10 text-muted-foreground/40 mb-4" />
            <p className="text-sm text-muted-foreground font-body">
              No projects yet. Create your first research project to get started.
            </p>
            <Button onClick={() => navigate("/project/new")} variant="outline" size="sm" className="mt-4 gap-2">
              <Plus className="h-3.5 w-3.5" />
              Create Project
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => {
              const status = statusConfig[project.status] || statusConfig.setup;
              return (
                <div
                  key={project.id}
                  className="group flex w-full items-center gap-5 rounded-lg border border-border bg-card px-6 py-4 text-left transition-colors hover:border-primary/30 hover:bg-secondary/50"
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-5 text-left"
                    onClick={() => navigate(`/project/${project.id}/transcripts`)}
                  >
                    <div className={`h-2 w-2 rounded-full shrink-0 ${status.dot}`} />

                    <div className="flex-1 min-w-0">
                      <h3 className="font-heading text-lg text-foreground leading-snug truncate">
                        {project.title}
                      </h3>
                      <div className="flex items-center gap-3 mt-1">
                        {project.approach && (
                          <span className="text-xs text-muted-foreground font-body">
                            {approachLabels[project.approach] || project.approach}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground/50">·</span>
                        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                          {status.label}
                        </span>
                      </div>
                    </div>

                    <span className="text-xs text-muted-foreground font-body tabular-nums shrink-0">
                      {format(new Date(project.created_at), "MMM d, yyyy")}
                    </span>

                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                  </button>

                  {project.user_id === currentUserId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setProjectToDelete(project);
                      }}
                      aria-label={`Delete ${project.title}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
