import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const AcceptInvite = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [projectTitle, setProjectTitle] = useState("");

  useEffect(() => {
    const processInvite = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          // If not logged in, redirect to auth but keep the invite path in session storage
          sessionStorage.setItem("returnTo", window.location.pathname);
          navigate("/auth");
          return;
        }

        const userId = session.user.id;

        // 1. Fetch and validate invite
        const { data: invite, error: inviteError } = await (supabase
          .from("project_invites" as any) as any)
          .select("*, project:projects(title)")
          .eq("token", token)
          .single();

        if (inviteError || !invite) {
          setStatus("error");
          setErrorMsg("This invitation link is invalid or has expired.");
          return;
        }

        if (invite.used_at) {
          setStatus("error");
          setErrorMsg("This invitation link has already been used.");
          return;
        }

        if (new Date(invite.expires_at) < new Date()) {
          setStatus("error");
          setErrorMsg("This invitation link has expired.");
          return;
        }

        setProjectTitle(invite.project?.title || "Project");

        // 2. Check if already a member
        const { data: existingMember } = await supabase
          .from("project_members")
          .select("*")
          .eq("project_id", invite.project_id)
          .eq("user_id", userId)
          .maybeSingle();

        if (existingMember) {
          toast.info("You are already a member of this project.");
          navigate(`/project/${invite.project_id}/transcripts`);
          return;
        }

        // 3. Add as member
        const { error: memberError } = await supabase
          .from("project_members")
          .insert({
            project_id: invite.project_id,
            user_id: userId,
            role: "collaborator",
          });

        if (memberError) {
          throw new Error("Failed to join project: " + memberError.message);
        }

        // 4. Mark invite as used
        await (supabase
          .from("project_invites" as any) as any)
          .update({
            used_at: new Date().toISOString(),
            used_by: userId,
          })
          .eq("id", invite.id);

        setStatus("success");
        toast.success(`You have joined "${invite.project?.title}"`);
        
        // Wait a moment to show success UI then redirect
        setTimeout(() => {
          navigate(`/project/${invite.project_id}/transcripts`);
        }, 2000);

      } catch (err: any) {
        setStatus("error");
        setErrorMsg(err.message || "An unexpected error occurred.");
      }
    };

    processInvite();
  }, [token, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-xl text-center">
        {status === "loading" && (
          <div className="space-y-4">
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
            <h2 className="text-xl font-semibold">Joining project...</h2>
            <p className="text-sm text-muted-foreground">Validating your invitation link</p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 mb-4 scale-in">
              <CheckCircle2 className="h-10 w-10 text-success" />
            </div>
            <h2 className="text-2xl font-semibold">Welcome aboard!</h2>
            <p className="text-sm text-muted-foreground">
              You have successfully joined <span className="font-medium text-foreground">{projectTitle}</span>.
            </p>
            <p className="text-xs text-muted-foreground animate-pulse">Redirecting to workspace...</p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 mb-4">
              <XCircle className="h-10 w-10 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold">Invitation Error</h2>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <Button onClick={() => navigate("/dashboard")} variant="outline" className="mt-4 w-full">
              Back to Dashboard
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AcceptInvite;
