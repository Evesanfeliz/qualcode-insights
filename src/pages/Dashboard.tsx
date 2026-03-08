import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchProjects, type Project } from "@/lib/supabase-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, LogOut } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const statusConfig: Record<string, { label: string; className: string }> = {
  setup: { label: "Setup", className: "bg-muted text-muted-foreground" },
  in_progress: { label: "In Progress", className: "bg-accent/15 text-accent" },
  complete: { label: "Complete", className: "bg-primary/10 text-primary" },
};

const approachLabels: Record<string, string> = {
  grounded: "Grounded",
  content: "Content",
  template: "Template",
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
    <div className="min-h-screen bg-secondary">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <h1 className="font-heading text-xl font-bold text-primary">
            QualCode AI
          </h1>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="font-heading text-2xl font-bold text-foreground">
              Projects
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your qualitative research projects
            </p>
          </div>
          <Button
            onClick={() => navigate("/project/new")}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-5 w-3/4 rounded bg-muted" />
                </CardHeader>
                <CardContent>
                  <div className="h-4 w-1/2 rounded bg-muted" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <p className="mb-4 text-muted-foreground">
                No projects yet. Create your first research project.
              </p>
              <Button
                onClick={() => navigate("/project/new")}
                className="bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <Plus className="mr-2 h-4 w-4" />
                New Project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="font-heading text-base font-semibold leading-snug">
                      {project.title}
                    </CardTitle>
                    <Badge
                      variant="secondary"
                      className={statusConfig[project.status]?.className}
                    >
                      {statusConfig[project.status]?.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex items-center gap-2 pt-0">
                  {project.approach && (
                    <Badge variant="outline" className="text-xs font-normal">
                      {approachLabels[project.approach]}
                    </Badge>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {format(new Date(project.created_at), "MMM d, yyyy")}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
