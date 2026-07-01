import { HelmetProvider } from "react-helmet-async";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SimixToastProvider } from "@/lib/simix-toast";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { useEffect } from "react";
import SupportChat from "@/components/support/SupportChat";
import { NotificationToast } from "@/components/notifications/NotificationToast";
import { PWAUpdateBanner } from "@/components/pwa/PWAUpdateBanner";
import { PWAInstallPrompt } from "@/components/pwa/PWAInstallPrompt";
import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";
import { PinLockProvider } from "@/context/PinLockContext";
import { PWAInstallProvider } from "@/context/PWAInstallContext";
import NotFound from "@/pages/not-found";
import { AdminSecureGuard } from "@/components/admin-secure-guard";
import { MaintenanceGuard } from "@/components/maintenance-guard";
import MaintenancePage from "@/pages/maintenance";

// Landing
import Landing from "@/pages/landing";
import Welcome from "@/pages/welcome";

// User pages
import Splash from "@/pages/splash";
import Login from "@/pages/auth/login";
import Register from "@/pages/auth/register";
import VerifyOtp from "@/pages/auth/verify-otp";
import ForgotPassword from "@/pages/auth/forgot-password";
import ResetPassword from "@/pages/auth/reset-password";
import Dashboard from "@/pages/dashboard";
import Profile from "@/pages/profile";
import Wallet from "@/pages/wallet";
import History from "@/pages/history";
import CryptoHistory from "@/pages/crypto-history";
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
import ProfileAideCentre from "@/pages/profile-aide-centre";
import ProfilePolitiqueConfidentialite from "@/pages/profile-politique-confidentialite";
import ProfileCGU from "@/pages/profile-cgu";
import ProfileCookies from "@/pages/profile-cookies";
import ProfileMentionsLegales from "@/pages/profile-mentions-legales";
import ProfileParrainage from "@/pages/profile-parrainage";
import ProfileApiDocs from "@/pages/profile-api-docs";
import NotificationsPage from "@/pages/notifications";

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
import AdminNotifications from "@/pages/admin/notifications";
import AdminEmails from "@/pages/admin/emails";
import AdminFooter from "@/pages/admin/footer";
import AdminBanners from "@/pages/admin/banners";
import AdminRealtime from "@/pages/admin/realtime";
import AdminBlacklist from "@/pages/admin/blacklist";
import AdminIpTracker from "@/pages/admin/ip-tracker";
import AdminLivePrices from "@/pages/admin/live-prices";
import AdminMedia from "@/pages/admin/media";
import AdminRouting from "@/pages/admin/routing";
import AdminServicePrices from "@/pages/admin/service-prices";
import AdminSync from "@/pages/admin/sync";
import AdminCurrencies from "@/pages/admin/currencies";
import AdminFxProfits from "@/pages/admin/fx-profits";
import AdminDiagnostics from "@/pages/admin/diagnostics";
import AdminRefunds from "@/pages/admin/refunds";
import AdminPricing from "@/pages/admin/pricing";
import AdminPaymentStats from "@/pages/admin/payment-stats";

// Toast demo
import ToastDemo from "@/pages/toast-demo";

// Public legal pages (no auth required)
import LegalCGU from "@/pages/legal/cgu";
import LegalPolitique from "@/pages/legal/politique-confidentialite";
import LegalMentions from "@/pages/legal/mentions-legales";
import LegalCookies from "@/pages/legal/cookies";

// Admin secure access pages (no guard — self-contained auth)
import Console from "@/pages/admin/console";
import SecureLogin from "@/pages/admin/secure-login";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      retry: 1,
      staleTime: 0,
    },
  },
});

function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);
  return <>{children}</>;
}

function AdminRoutes() {
  return (
    <AdminSecureGuard>
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
        <Route path="/admin/notifications" component={AdminNotifications} />
        <Route path="/admin/emails" component={AdminEmails} />
        <Route path="/admin/banners" component={AdminBanners} />
        <Route path="/admin/realtime" component={AdminRealtime} />
        <Route path="/admin/footer" component={AdminFooter} />
        <Route path="/admin/settings" component={AdminSettings} />
        <Route path="/admin/blacklist" component={AdminBlacklist} />
        <Route path="/admin/ip-tracker" component={AdminIpTracker} />
        <Route path="/admin/live-prices" component={AdminLivePrices} />
        <Route path="/admin/media" component={AdminMedia} />
        <Route path="/admin/routing" component={AdminRouting} />
        <Route path="/admin/service-prices" component={AdminServicePrices} />
        <Route path="/admin/sync" component={AdminSync} />
        <Route path="/admin/currencies" component={AdminCurrencies} />
        <Route path="/admin/fx-profits" component={AdminFxProfits} />
        <Route path="/admin/diagnostics" component={AdminDiagnostics} />
        <Route path="/admin/refunds" component={AdminRefunds} />
        <Route path="/admin/pricing" component={AdminPricing} />
        <Route path="/admin/payment-stats" component={AdminPaymentStats} />
      </Switch>
    </AdminSecureGuard>
  );
}

function InnerRouter() {
  const [location] = useLocation();
  const isAdmin = location.startsWith("/admin");
  const isLanding = location === "/";
  const isSecurePage = location === "/console" || location === "/admin-login";

  /* ── Maintenance page (standalone — no AppLayout, white bg) ── */
  if (location === "/maintenance") return <MaintenancePage />;

  /* ── Secure admin entry points (no wrapper, no mobile container) ── */
  if (location === "/console") return <Console />;
  if (location === "/admin-login") return <SecureLogin />;
  if (location === "/admin/secure-login") return <SecureLogin />;

  if (isAdmin) {
    return <AdminRoutes />;
  }

  if (isLanding) {
    return <Landing />;
  }

  if (location === "/toast-demo") {
    return <ToastDemo />;
  }

  if (location.startsWith("/legal")) {
    return (
      <Switch>
        <Route path="/legal/cgu" component={LegalCGU} />
        <Route path="/legal/politique-confidentialite" component={LegalPolitique} />
        <Route path="/legal/mentions-legales" component={LegalMentions} />
        <Route path="/legal/cookies" component={LegalCookies} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  return (
    <div className="flex justify-center min-h-[100dvh] bg-black">
      <div className="w-full max-w-md bg-background relative shadow-2xl sm:border-x sm:border-border overflow-hidden">
        <Switch>
          <Route path="/bienvenue" component={Welcome} />
          <Route path="/splash" component={Splash} />
          <Route path="/login" component={Login} />
          <Route path="/register" component={Register} />
          <Route path="/verify-email" component={VerifyOtp} />
          <Route path="/forgot-password" component={ForgotPassword} />
          <Route path="/reset-password" component={ResetPassword} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/profile" component={Profile} />
          <Route path="/wallet" component={Wallet} />
          <Route path="/history" component={History} />
          <Route path="/history/crypto" component={CryptoHistory} />
          <Route path="/services" component={Services} />
          <Route path="/countries" component={Countries} />
          <Route path="/numbers/new" component={NumberDetails} />
          <Route path="/numbers/:id" component={NumberAssigned} />
          <Route path="/profile/informations" component={ProfileInformations} />
          <Route path="/profile/securite" component={ProfileSecurite} />
          <Route path="/notifications" component={NotificationsPage} />
          <Route path="/profile/notifications" component={ProfileNotifications} />
          <Route path="/profile/paiement" component={ProfilePaiement} />
          <Route path="/profile/confidentialite" component={ProfileConfidentialite} />
          <Route path="/profile/aide" component={ProfileAide} />
          <Route path="/profile/aide/centre" component={ProfileAideCentre} />
          <Route path="/profile/politique-confidentialite" component={ProfilePolitiqueConfidentialite} />
          <Route path="/profile/cgu" component={ProfileCGU} />
          <Route path="/profile/cookies" component={ProfileCookies} />
          <Route path="/profile/mentions-legales" component={ProfileMentionsLegales} />
          <Route path="/profile/parrainage" component={ProfileParrainage} />
          <Route path="/profile/api-docs" component={ProfileApiDocs} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </div>
  );
}

function AppShell() {
  const [location] = useLocation();
  const hideChat = location.startsWith("/admin") || location === "/console" || location === "/admin-login";
  return (
    <PinLockProvider>
      <MaintenanceGuard>
        <InnerRouter />
      </MaintenanceGuard>
      <Toaster />
      {!hideChat && <SupportChat />}
      <NotificationToast />
      <OfflineIndicator />
      <PWAUpdateBanner />
      {!hideChat && <PWAInstallPrompt />}
    </PinLockProvider>
  );
}

function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <ConfirmDialogProvider>
              <SimixToastProvider>
                <PWAInstallProvider>
                  <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                    <AppShell />
                  </WouterRouter>
                </PWAInstallProvider>
              </SimixToastProvider>
            </ConfirmDialogProvider>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
