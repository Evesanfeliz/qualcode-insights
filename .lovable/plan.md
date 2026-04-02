## Plan: Light Theme + Theories + A Priori Coding

### Step 1: Database — Create `theories` table
- New table: `theories` (id, project_id, name, description, color, created_at)
- Add `theory_id` column to `codes` table (nullable FK to theories)
- RLS policies for project members

### Step 2: Light Theme Redesign
- Update `index.css` CSS variables to warm off-white palette (#FAF9F7 background)
- Update all semantic tokens: card, popover, sidebar, borders
- Adjust text colors for proper contrast on light backgrounds
- Keep teal (#0E9E8A) as primary accent

### Step 3: Transcript Formatting
- Update CodingWorkspace transcript rendering to preserve original line breaks, paragraphs, and whitespace structure from uploaded documents

### Step 4: Theory Management UI
- Add theory management section (create theories with name, description, color picker)
- Location: accessible from project settings or a dedicated section
- Color picker for selecting theory color

### Step 5: Code-Theory Linking
- In Codebook: add theory dropdown to code detail editor
- Codes inherit the linked theory's color
- In CodingWorkspace: code creation popover shows theory selector
- Highlights in transcript use the theory's color

### Step 6: A Priori Codebook Enhancement
- Always show: theory link, description, purpose, example fields in codebook
- Make these fields prominent for pre-analysis code setup
