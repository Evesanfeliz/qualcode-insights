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
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/project/new" element={<NewProject />} />
          <Route path="/project/:projectId/transcripts" element={<TranscriptManager />} />
          <Route path="/project/:projectId/code/:transcriptId" element={<CodingWorkspace />} />
          <Route path="/project/:projectId/codebook" element={<Codebook />} />
          <Route path="/project/:projectId/memos" element={<MemoPad />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
