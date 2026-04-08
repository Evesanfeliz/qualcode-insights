import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Users, Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const AcceptInvite = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "unauthenticated" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  
  // Signup/Signin form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const fetchInviteData = async () => {
    try {
      const { data: invite, error: inviteError } = await (supabase
        .from("project_invites" as any) as any)
        .select("*, project:projects(title)")
        .eq("token", token)
        .single();

      if (inviteError || !invite) {
        setStatus("error");
        setErrorMsg("This invitation link is invalid or has expired.");
        return null;
      }

      if (invite.used_at) {
        setStatus("error");
        setErrorMsg("This invitation link has already been used.");
        return null;
      }

      if (new Date(invite.expires_at) < new Date()) {
        setStatus("error");
        setErrorMsg("This invitation link has expired.");
        return null;
      }

      setProjectTitle(invite.project?.title || "Project");
      setProjectId(invite.project_id);
      return invite;
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message || "An unexpected error occurred.");
      return null;
    }
  };

  const joinProject = async (uid: string, pid: string, inviteId: string, title: string) => {
    try {
      // 1. Check if already a member
      const { data: existingMember } = await supabase
        .from("project_members")
        .select("*")
        .eq("project_id", pid)
        .eq("user_id", uid)
        .maybeSingle();

      if (existingMember) {
        toast.info("You are already a member of this project.");
        navigate(`/project/${pid}/transcripts`);
        return;
      }

      // 2. Add as member
      const { error: memberError } = await supabase
        .from("project_members")
        .insert({
          project_id: pid,
          user_id: uid,
          role: "collaborator",
        });

      if (memberError) {
        throw new Error("Failed to join project: " + memberError.message);
      }

      // 3. Mark invite as used
      await (supabase
        .from("project_invites" as any) as any)
        .update({
          used_at: new Date().toISOString(),
          used_by: uid,
        })
        .eq("id", inviteId);

      setStatus("success");
      toast.success(`You have joined "${title}"`);
      
      setTimeout(() => {
        navigate(`/project/${pid}/transcripts`);
      }, 2000);
    } catch (err: any) {
      setStatus("error");
      setErrorMsg(err.message || "Failed to join project.");
    }
  };

  useEffect(() => {
    const checkSessionAndProcess = async () => {
      const invite = await fetchInviteData();
      if (!invite) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStatus("unauthenticated");
        return;
      }

      setUserId(session.user.id);
      await joinProject(session.user.id, invite.project_id, invite.id, invite.project?.title || "Project");
    };

    checkSessionAndProcess();
  }, [token, navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);

    try {
      // First try to sign in, if fails, try to sign up
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      let currentUserId = signInData?.user?.id;

      if (signInError) {
        // If sign in fails, try sign up
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) throw signUpError;
        currentUserId = signUpData?.user?.id;
        
        if (!signUpData.session) {
          toast.success("Account created! Please check your email to confirm, then click the invite link again.");
          setAuthLoading(false);
          return;
        }
      }

      if (currentUserId && projectId) {
        const invite = await fetchInviteData();
        if (invite) {
          await joinProject(currentUserId, projectId, invite.id, projectTitle);
        }
      }
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-1 shadow-xl overflow-hidden">
        <div className="p-8 text-center space-y-6">
          {status === "loading" && (
            <div className="space-y-4 py-8">
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
              <h2 className="text-xl font-semibold">Joining project...</h2>
              <p className="text-sm text-muted-foreground">Validating your invitation link</p>
            </div>
          )}

          {status === "unauthenticated" && (
            <div className="space-y-6">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight">You're Invited!</h2>
                <p className="text-muted-foreground">
                  Join <span className="font-semibold text-foreground">{projectTitle}</span> to collaborate on research coding.
                </p>
              </div>

              <form onSubmit={handleAuth} className="space-y-4 text-left">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@example.com"
                      className="pl-10"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="Create a password"
                      className="pl-10"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={authLoading}>
                  {authLoading ? "Joining..." : "Create Account & Join"}
                </Button>
              </form>
              
              <p className="text-[10px] text-muted-foreground">
                By joining, you agree to our terms and privacy policy.
              </p>
            </div>
          )}

          {status === "success" && (
            <div className="space-y-4 py-8">
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
            <div className="space-y-4 py-8">
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
    </div>
  );
};

export default AcceptInvite;

