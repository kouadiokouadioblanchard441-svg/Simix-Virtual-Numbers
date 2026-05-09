import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import SupportChat from "@/components/support/SupportChat";
import NotFound from "@/pages/not-found";

// Landing
import Landing from "@/pages/landing";

// User pages
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
import ProfileInformations from "@/pages/profile-informations";
import ProfileSecurite from "@/pages/profile-securite";
import ProfileNotifications from "@/pages/profile-notifications";
import ProfilePaiement from "@/pages/profile-paiement";
import ProfileConfidentialite from "@/pages/profile-confidentialite";
import ProfileAide from "@/pages/profile-aide";

// Admin pages
import AdminDashboard from "@/pages/admin/dashboard";
import AdminUsers from "@/pages/admin/users";
import AdminOrders from "@/pages/admin/orders";
import AdminTransactions from "@/pages/admin/transactions";
import AdminServices from "@/pages/admin/services";
import AdminProviders from "@/pages/admin/providers";
import AdminSecurity from "@/pages/admin/security";
import AdminLogs from "@/pages/admin/logs";
import AdminSettings from "@/pages/admin/settings";
import AdminPaymentConfig from "@/pages/admin/payment-config";
import AdminAnalytics from "@/pages/admin/analytics";
import AdminSupport from "@/pages/admin/support";

const queryClient = new QueryClient();

function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);
  return <>{children}</>;
}

function AdminRoutes() {
  return (
    <Switch>
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/orders" component={AdminOrders} />
      <Route path="/admin/transactions" component={AdminTransactions} />
      <Route path="/admin/services" component={AdminServices} />
      <Route path="/admin/providers" component={AdminProviders} />
      <Route path="/admin/security" component={AdminSecurity} />
      <Route path="/admin/logs" component={AdminLogs} />
      <Route path="/admin/analytics" component={AdminAnalytics} />
      <Route path="/admin/payment-config" component={AdminPaymentConfig} />
      <Route path="/admin/support" component={AdminSupport} />
      <Route path="/admin/settings" component={AdminSettings} />
    </Switch>
  );
}

function InnerRouter() {
  const [location] = useLocation();
  const isAdmin = location.startsWith("/admin");
  const isLanding = location === "/";

  if (isAdmin) {
    return <AdminRoutes />;
  }

  if (isLanding) {
    return <Landing />;
  }

  return (
    <div className="flex justify-center min-h-[100dvh] bg-black">
      <div className="w-full max-w-md bg-background relative shadow-2xl sm:border-x sm:border-border overflow-hidden">
        <Switch>
          <Route path="/splash" component={Splash} />
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
          <Route path="/profile/informations" component={ProfileInformations} />
          <Route path="/profile/securite" component={ProfileSecurite} />
          <Route path="/profile/notifications" component={ProfileNotifications} />
          <Route path="/profile/paiement" component={ProfilePaiement} />
          <Route path="/profile/confidentialite" component={ProfileConfidentialite} />
          <Route path="/profile/aide" component={ProfileAide} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <InnerRouter />
          </WouterRouter>
          <Toaster />
          <SupportChat />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
