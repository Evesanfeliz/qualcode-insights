import { supabase } from "@/integrations/supabase/client";

export type Project = {
  id: string;
  user_id: string;
  title: string;
  research_question: string | null;
  approach: 'grounded' | 'content' | 'template' | null;
  reasoning_mode: 'inductive' | 'deductive' | 'abductive' | null;
  domain_framework: string | null;
  status: 'setup' | 'in_progress' | 'complete';
  created_at: string;
  updated_at: string;
};

export async function fetchProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Project[];
}

export async function createProject(project: {
  title: string;
  research_question?: string;
  approach?: string;
  reasoning_mode?: string;
  domain_framework?: string;
  collaborator_email?: string;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: user.id,
      title: project.title,
      research_question: project.research_question || null,
      approach: project.approach || null,
      reasoning_mode: project.reasoning_mode || null,
      domain_framework: project.domain_framework || null,
    })
    .select()
    .single();

  if (error) throw error;

  // Add owner as project member
  await supabase.from('project_members').insert({
    project_id: data.id,
    user_id: user.id,
    role: 'owner',
    color_theme: 'teal',
  });

  // If collaborator email provided, we store it for future invitation
  // (actual invite logic would require edge functions for email)

  return data;
}
