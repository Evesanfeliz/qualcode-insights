import { useState, useEffect } from "react";
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
import { Copy, Link, Shield, Users, Clock, Check, X } from "lucide-react";
import { format } from "date-fns";

interface ProjectInviteModalProps {
  projectId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ProjectInviteModal = ({ projectId, isOpen, onOpenChange }: ProjectInviteModalProps) => {
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [invite, setInvite] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const fetchInvite = async () => {
    setLoading(true);
    const { data, error } = await (supabase
      .from("project_invites" as any) as any)
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
      setInvite(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      fetchInvite();
    }
  }, [isOpen, projectId]);

  const createInvite = async () => {
    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("project_invites" as any)
      .insert({
        project_id: projectId,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      toast.error("Failed to generate invite: " + error.message);
    } else {
      setInvite(data);
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

        <div className="py-6">
          {loading ? (
            <div className="flex justify-center py-8">
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
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-4">No active invite links found.</p>
              <Button onClick={createInvite} disabled={creating} className="w-full">
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
