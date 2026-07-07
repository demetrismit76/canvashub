import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Auth from "./pages/Auth.tsx";
import SharedReview from "./pages/SharedReview.tsx";
import Admin from "./pages/Admin.tsx";
import { useAccountStatus } from "@/hooks/useAccountStatus";
import { useGlobalLightTheme } from "@/hooks/useGlobalLightTheme";
import { SyncStatus } from "@/components/dm/SyncStatus";

const queryClient = new QueryClient();

const AccountStatusGate = () => { useAccountStatus(); return null; };
const GlobalThemeGate = () => { useGlobalLightTheme(); return null; };

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AccountStatusGate />
        <GlobalThemeGate />
        <SyncStatus />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/s/:token" element={<SharedReview />} />
          <Route path="/admin" element={<Admin />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
