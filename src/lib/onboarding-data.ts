export const PRACTICE_TRANSCRIPT = {
  participant_pseudonym: "Marco",
  title: "Practice Interview — AI and Solopreneurship",
  content: `Interviewer: Can you describe a typical working day?

Marco: Sure. I wake up around seven, make coffee, and before I even open my laptop I check what the AI has already done overnight. I have it set up to draft my client reports while I sleep. So by the time I sit down, half my morning admin is already handled. I used to spend two hours on that. Now it's maybe twenty minutes of review.

Interviewer: How does that feel?

Marco: Honestly? It felt strange at first. Like, is this still my work? I had this moment where a client really praised a report and I thought, should I feel proud of that? I wrote the brief but the AI wrote the words. I've made peace with it now. I think of it like having a very fast assistant who never gets tired. The thinking is still mine. The judgment is still mine. But the execution — a lot of that is automated now.

Interviewer: Has it changed what kind of work you focus on?

Marco: Completely. I spend almost no time on routine tasks anymore. Which sounds great, but it also means I have nowhere to hide. Before, if I was avoiding a difficult client conversation, I could tell myself I was busy with reports. Now the reports are done, and the difficult conversation is just sitting there, staring at me. The AI removed my excuses. I think that's made me better at my job, but it's also more uncomfortable.

Interviewer: What about your sense of yourself as a professional?

Marco: That's a good question. I think I've become more strategic. I used to be proud of how fast I could produce things. Now I'm proud of the questions I ask and the problems I frame. The AI produces fast. I need to produce something different — insight, direction, relationships. Things it can't replicate. It's pushed me to figure out what my actual value is. Which is uncomfortable but probably necessary.`,
};

export const TOUR_STEPS = [
  {
    id: "sidebar",
    attachTo: "[data-tour='sidebar']",
    title: "Your research workspace",
    text: "Everything lives in this sidebar. Each item is a different phase of your analysis. We will walk through each one now.",
  },
  {
    id: "dashboard",
    attachTo: "[data-tour='dashboard-link']",
    title: "Dashboard",
    text: "Your projects live here. Each project is one research study. For your thesis, you will have one project shared with your partner.",
  },
  {
    id: "transcripts",
    attachTo: "[data-tour='transcripts-link']",
    title: "Transcripts",
    text: "Upload your interview recordings here after transcribing them. Assign each transcript to either you or your partner. Each of you will code the transcripts assigned to you.",
  },
  {
    id: "coding",
    attachTo: "[data-tour='codebook-link']",
    title: "Coding Workspace",
    text: "This is where you spend most of your time. Select text, apply codes, ask the AI for suggestions. Start with open coding — label everything that seems meaningful. Do not filter yourself at this stage.",
  },
  {
    id: "codebook",
    attachTo: "[data-tour='codebook-link']",
    title: "Codebook",
    text: "As you code, your codes appear here. For each code, write a definition and an example quote. This is how you and your partner stay consistent — you are both working from the same definitions. The AI will flag it if your codes start to drift apart.",
  },
  {
    id: "memos",
    attachTo: "[data-tour='memos-link']",
    title: "Memo Pad",
    text: "Memos are your analytical journal. Write one every time you notice something significant in the data. Not a summary — an observation, a question, a tentative argument. The AI scores each memo and challenges you to think deeper. Memos with a T score are the raw material of your theory.",
  },
  {
    id: "literature",
    attachTo: "[data-tour='literature-link']",
    title: "Literature",
    text: "Upload the core papers from your theoretical framework here. The AI will extract their key concepts. Later, it will show you how your empirical codes connect to, extend, or challenge those theoretical concepts. This is the bridge between your data and your contribution.",
  },
  {
    id: "theory",
    attachTo: "[data-tour='theory-link']",
    title: "Theory Workshop",
    text: "This screen unlocks after you have coded enough transcripts and written enough analytical memos. The AI reads everything you have done and proposes theoretical propositions — claims about the world your data supports. Then it attacks those propositions with counter-evidence from your own transcripts. You defend, refine, or reject each one.",
  },
  {
    id: "canvas",
    attachTo: "[data-tour='canvas-link']",
    title: "Theory Canvas",
    text: "The canvas is a live visual map of your entire analysis. Codes, categories, themes, and propositions appear as nodes. You and your partner build it together in real time. Export it as an image for your thesis appendix.",
  },
  {
    id: "partner",
    attachTo: "[data-tour='sidebar']",
    title: "Your partner",
    text: "Your research partner appears here. You will see which transcripts they are coding in real time. Any disagreements about codes open a structured thread where you both explain your interpretation — and the AI proposes a resolution.",
  },
  {
    id: "help",
    attachTo: "[data-tour='help-link']",
    title: "Come back here any time",
    text: "Click Help at any time to replay this tour, revisit the methodology explanations, or redo the practice session with a fresh transcript.",
  },
  {
    id: "ready",
    attachTo: undefined,
    title: "You are ready to begin",
    text: "Start by uploading your first transcript. Code slowly and carefully. Write a memo after every transcript. Trust the process — the theory will emerge from the data. Good luck with your research.",
  },
];
