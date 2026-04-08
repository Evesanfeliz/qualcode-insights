import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Copy, Link, Shield, Users, Clock, Check, X, Mail, Search } from "lucide-react";
import { format } from "date-fns";

interface ProjectInviteModalProps {
  projectId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ProjectInvite {
  id: string;
  project_id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
}

export const ProjectInviteModal = ({ projectId, isOpen, onOpenChange }: ProjectInviteModalProps) => {
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [invite, setInvite] = useState<ProjectInvite | null>(null);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState("");
  const [invitingByEmail, setInvitingByEmail] = useState(false);

  const fetchInvite = useCallback(async () => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("project_invites" as any) as any)
      .select("*")
      .eq("project_id", projectId)
      .filter("expires_at", "gt", new Date().toISOString())
      .filter("used_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error fetching invite:", error);
    } else {
      setInvite(data as ProjectInvite);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (isOpen) {
      fetchInvite();
    }
  }, [isOpen, fetchInvite]);

  const createInvite = async () => {
    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from("project_invites" as any) as any)
      .insert({
        project_id: projectId,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      toast.error("Failed to generate invite: " + error.message);
    } else {
      setInvite(data as ProjectInvite);
      toast.success("Invite link generated");
    }
    setCreating(false);
  };

  const copyLink = () => {
    if (!invite) return;
    const link = `${window.location.origin}/#/invite/${invite.token}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Invite link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };
  
  const handleInviteByEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setInvitingByEmail(true);
    try {
      // 1. Find user by email in profiles
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile, error: profileError } = await (supabase.from("profiles" as any) as any)
        .select("id")
        .eq("email", email.toLowerCase().trim())
        .maybeSingle();

      if (profileError) throw profileError;
      
      if (!profile) {
        toast.error(`No user found with email ${email}. Ask them to sign up first!`);
        return;
      }

      // 2. Check if already a member
      const { data: existingMember } = await supabase
        .from("project_members")
        .select("*")
        .eq("project_id", projectId)
        .eq("user_id", profile.id as string)
        .maybeSingle();

      if (existingMember) {
        toast.info("This user is already a member of the project.");
        return;
      }

      // 3. Add to project_members
      const { error: memberError } = await supabase
        .from("project_members")
        .insert({
          project_id: projectId,
          user_id: profile.id as string,
          role: "collaborator",
        });

      if (memberError) throw memberError;

      toast.success(`Succesfully added ${email} to the project!`);
      setEmail("");
      onOpenChange(false);
    } catch (error: unknown) {
      const err = error as Error;
      console.error("Invite error:", err);
      toast.error(err.message || "Failed to invite user");
    } finally {
      setInvitingByEmail(false);
    }
  };

  const inviteLink = invite ? `${window.location.origin}/#/invite/${invite.token}` : "";

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Collaborate on this project</DialogTitle>
          <DialogDescription className="text-center">
            Invite a thesis peer or collaborator to code together in real-time.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-6">
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Mail className="h-3 w-3" />
              Invite by Email
            </h4>
            <form onSubmit={handleInviteByEmail} className="flex gap-2">
              <Input
                placeholder="collaborator@example.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9 text-sm"
                required
              />
              <Button type="submit" size="sm" disabled={invitingByEmail}>
                {invitingByEmail ? "Adding..." : "Add"}
              </Button>
            </form>
            <p className="text-[10px] text-muted-foreground">
              New users can join immediately via the link below.
            </p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-[10px] uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or share link</span>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-4">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : invite ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-md bg-secondary/50 p-2 border border-border">
                <Link className="h-4 w-4 text-muted-foreground ml-2 shrink-0" />
                <Input
                  className="border-0 bg-transparent h-8 text-xs focus-visible:ring-0 select-all"
                  value={inviteLink}
                  readOnly
                />
                <Button size="sm" variant="ghost" onClick={copyLink} className="h-8 shrink-0">
                  {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
              <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  <span>One-time use per link</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>Expires {format(new Date(invite.expires_at), "MMM d")}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-2">
              <Button onClick={createInvite} disabled={creating} variant="outline" size="sm" className="w-full text-xs h-8">
                {creating ? "Generating..." : "Generate Invite Link"}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-center">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-xs">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
