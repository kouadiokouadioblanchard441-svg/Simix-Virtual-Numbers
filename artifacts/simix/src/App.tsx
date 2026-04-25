import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import NotFound from "@/pages/not-found";

// Pages
import Splash from "@/pages/splash";
import Login from "@/pages/auth/login";
import Register from "@/pages/auth/register";
import Dashboard from "@/pages/dashboard";
import Profile from "@/pages/profile";
import Wallet from "@/pages/wallet";
import History from "@/pages/history";
import Services from "@/pages/services";
import Countries from "@/pages/countries";
import NumberDetails from "@/pages/number-details";
import NumberAssigned from "@/pages/number-assigned";

const queryClient = new QueryClient();

function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Splash} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/dashboard" component={Dashboard} /> 
      <Route path="/profile" component={Profile} />
      <Route path="/wallet" component={Wallet} />
      <Route path="/history" component={History} />
      <Route path="/services" component={Services} />
      <Route path="/countries" component={Countries} />
      <Route path="/numbers/new" component={NumberDetails} />
      <Route path="/numbers/:id" component={NumberAssigned} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <div className="flex justify-center min-h-[100dvh] bg-black">
            <div className="w-full max-w-md bg-background relative shadow-2xl sm:border-x sm:border-border overflow-hidden">
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <Router />
              </WouterRouter>
              <Toaster />
            </div>
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
