import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import NewProject from "./pages/NewProject";
import TranscriptManager from "./pages/TranscriptManager";
import CodingWorkspace from "./pages/CodingWorkspace";
import Codebook from "./pages/Codebook";
import MemoPad from "./pages/MemoPad";
import Literature from "./pages/Literature";
import Theory from "./pages/Theory";
import Canvas from "./pages/Canvas";
import OnboardingWelcome from "./pages/OnboardingWelcome";
import OnboardingPractice from "./pages/OnboardingPractice";
import AcceptInvite from "./pages/AcceptInvite";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/onboarding/welcome" element={<OnboardingWelcome />} />
          <Route path="/onboarding/practice" element={<OnboardingPractice />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/invite/:token" element={<AcceptInvite />} />
          <Route path="/project/new" element={<NewProject />} />
          <Route path="/project/:projectId/transcripts" element={<TranscriptManager />} />
          <Route path="/project/:projectId/code/:transcriptId" element={<CodingWorkspace />} />
          <Route path="/project/:projectId/codebook" element={<Codebook />} />
          <Route path="/project/:projectId/memos" element={<MemoPad />} />
          <Route path="/project/:projectId/literature" element={<Literature />} />
          <Route path="/project/:projectId/theory" element={<Theory />} />
          <Route path="/project/:projectId/canvas" element={<Canvas />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
