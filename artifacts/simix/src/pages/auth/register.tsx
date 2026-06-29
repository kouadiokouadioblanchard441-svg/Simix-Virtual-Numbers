import { useState, useMemo, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRegister, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, ChevronLeft, Shield, User, Mail, Lock, AtSign, Search, Gift } from "lucide-react";
import { FaGoogle } from "react-icons/fa";
import { motion } from "framer-motion";
import { SimixLogo } from "@/components/simix-logo";
import { TurnstileWidget, useTurnstileToken } from "@/components/turnstile/TurnstileWidget";

const formSchema = z.object({
  fullName: z.string().min(2, "Le nom complet est requis (min 2 caractères)"),
  email: z.string().email("Adresse email invalide"),
  username: z.string().min(3, "Le nom d'utilisateur doit faire au moins 3 caractères").max(20, "Max 20 caractères").regex(/^[a-zA-Z0-9]+$/, "Lettres et chiffres uniquement").optional().or(z.literal("")),
  phone: z.string().min(6, "Le numéro de téléphone est requis"),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
  confirmPassword: z.string(),
  terms: z.boolean().refine((val) => val === true, { message: "Vous devez accepter les conditions" }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
});

/* ── Minimal fallback countries in case API is unreachable ── */
const FALLBACK_COUNTRIES = [
  { code: "ci", dial: "+225", label: "Côte d'Ivoire", flag: "🇨🇮" },
  { code: "sn", dial: "+221", label: "Sénégal", flag: "🇸🇳" },
  { code: "ml", dial: "+223", label: "Mali", flag: "🇲🇱" },
  { code: "bf", dial: "+226", label: "Burkina Faso", flag: "🇧🇫" },
  { code: "cm", dial: "+237", label: "Cameroun", flag: "🇨🇲" },
  { code: "ng", dial: "+234", label: "Nigéria", flag: "🇳🇬" },
  { code: "gh", dial: "+233", label: "Ghana", flag: "🇬🇭" },
  { code: "ke", dial: "+254", label: "Kenya", flag: "🇰🇪" },
  { code: "tg", dial: "+228", label: "Togo", flag: "🇹🇬" },
  { code: "bj", dial: "+229", label: "Bénin", flag: "🇧🇯" },
];

interface RegistrationCountry { code: string; dial: string; label: string; flag?: string; }

function FlagImg({ code }: { code: string }) {
  const [err, setErr] = useState(false);
  if (err) return <span className="text-base w-5 inline-block text-center">{code.toUpperCase()}</span>;
  return (
    <img
      src={`https://flagcdn.com/20x15/${code.toLowerCase()}.png`}
      srcSet={`https://flagcdn.com/40x30/${code.toLowerCase()}.png 2x`}
      alt={code}
      onError={() => setErr(true)}
      className="w-5 h-3.5 object-cover rounded-sm flex-shrink-0"
    />
  );
}

const GOOGLE_ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  google_not_configured:        { title: "Google non activé",       description: "L'authentification Google n'est pas encore configurée. Utilisez l'inscription classique." },
  google_denied:                { title: "Connexion annulée",        description: "Vous avez annulé la connexion avec Google." },
  google_session_expired:       { title: "Session expirée",          description: "Votre session a expiré. Veuillez réessayer la connexion Google." },
  invalid_state:                { title: "Erreur de sécurité",       description: "Une erreur de validation s'est produite. Réessayez depuis un onglet normal." },
  google_token_exchange_failed: { title: "Échec Google",             description: "La connexion Google a échoué. Vérifiez la configuration OAuth dans Google Console." },
  google_no_token:              { title: "Token invalide",           description: "Impossible de vérifier votre identité Google. Réessayez." },
  google_invalid_token:         { title: "Token invalide",           description: "Impossible de vérifier votre identité Google. Réessayez." },
  google_no_email:              { title: "Email manquant",           description: "Google n'a pas fourni votre adresse email. Vérifiez vos paramètres Google." },
  google_auth_failed:           { title: "Échec d'authentification", description: "La connexion avec Google a échoué. Réessayez ou utilisez l'inscription classique." },
  account_blocked:              { title: "Compte suspendu",          description: "Votre compte a été suspendu. Contactez le support." },
  missing_code:                 { title: "Erreur OAuth",             description: "Code d'autorisation manquant. Veuillez réessayer." },
};

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const registerMutation = useRegister();
  const { token: turnstileToken, handleSuccess: handleTurnstileSuccess, handleExpire: handleTurnstileExpire, handleError: handleTurnstileError } = useTurnstileToken();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [selectedCountryCode, setSelectedCountryCode] = useState("ci");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [referralCode, setReferralCode] = useState("");

  /* ── Fetch enabled registration countries from API ── */
  const [countries, setCountries] = useState<RegistrationCountry[]>(FALLBACK_COUNTRIES);
  useEffect(() => {
    fetch("/api/public/registration-countries", { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: RegistrationCountry[]) => {
        if (Array.isArray(data) && data.length > 0) setCountries(data);
      })
      .catch(() => { /* keep fallback */ });
  }, []);

  /* ── Pre-fill referral code from URL ?ref= ── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) setReferralCode(ref.toUpperCase());
  }, []);

  /* ── Show toast when redirected back from Google OAuth with an error ── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get("error");
    if (errorCode) {
      const msg = GOOGLE_ERROR_MESSAGES[errorCode] ?? {
        title: "Erreur de connexion",
        description: "Une erreur s'est produite lors de la connexion. Veuillez réessayer.",
      };
      toast({ title: msg.title, description: msg.description, variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const selectedCountry = countries.find(c => c.code === selectedCountryCode) ?? countries[0];

  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return countries;
    return countries.filter(c =>
      c.label.toLowerCase().includes(countrySearch.toLowerCase()) ||
      c.dial.includes(countrySearch)
    );
  }, [countrySearch, countries]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { fullName: "", email: "", username: "", phone: "", password: "", confirmPassword: "", terms: false },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const result = await registerMutation.mutateAsync({
        data: {
          fullName: values.fullName,
          phone: values.phone,
          password: values.password,
          countryCode: selectedCountry?.dial ?? "+225",
          email: values.email,
          ...(referralCode.trim() ? { referralCode: referralCode.trim() } : {}),
          "cf-turnstile-response": turnstileToken,
        } as any
      }) as { requiresEmailVerification?: boolean };
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      if (result?.requiresEmailVerification) {
        setLocation("/verify-email");
      } else {
        setLocation("/bienvenue");
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Une erreur est survenue";
      toast({ title: "Inscription impossible", description: msg || "Vérifiez vos informations et réessayez. Si le problème persiste, contactez le support.", variant: "destructive" });
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col px-6 py-6 relative overflow-y-auto">
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="flex items-center justify-between mb-6 z-10">
        <Link href="/login" className="w-10 h-10 rounded-xl bg-card border border-card-border flex items-center justify-center text-foreground hover:bg-secondary transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <SimixLogo size={32} />
        <div className="w-10 h-10 rounded-xl border border-primary/30 flex items-center justify-center bg-primary/10">
          <Shield className="w-4 h-4 text-primary" />
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col max-w-sm w-full mx-auto z-10 pb-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground mb-1">Bienvenue sur Simix</h1>
          <p className="text-sm text-muted-foreground">Inscrivez-vous gratuitement en quelques secondes.</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

            <FormField control={form.control} name="fullName" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-foreground">Nom complet <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <div className="relative h-14">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="Jean Konan" className="pl-11 h-full rounded-full bg-zinc-900 border border-zinc-700/60 text-white placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:border-primary/60 transition-all duration-200 shadow-sm" {...field} />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-foreground">Email <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <div className="relative h-14">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input type="email" placeholder="jean@exemple.com" className="pl-11 h-full rounded-full bg-zinc-900 border border-zinc-700/60 text-white placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:border-primary/60 transition-all duration-200 shadow-sm" {...field} />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="username" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-foreground flex items-center gap-1">
                  Nom d'utilisateur <span className="text-muted-foreground text-xs font-normal">(optionnel)</span>
                </FormLabel>
                <FormControl>
                  <div className="relative h-14">
                    <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="jeankonan" className="pl-11 h-full rounded-full bg-zinc-900 border border-zinc-700/60 text-white placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:border-primary/60 transition-all duration-200 shadow-sm" {...field} />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-foreground">Téléphone <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <div className="flex h-14 bg-zinc-900 border border-zinc-700/60 rounded-full overflow-visible focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary/60 transition-all duration-200 relative shadow-sm">
                    <button
                      type="button"
                      onClick={() => { setShowCountryPicker(p => !p); setCountrySearch(""); }}
                      className="flex items-center gap-2 px-4 border-r border-zinc-700/60 text-sm font-semibold text-white hover:bg-zinc-800/60 transition-colors shrink-0 rounded-l-full"
                    >
                      <FlagImg code={selectedCountry?.code ?? "ci"} />
                      <span className="font-mono text-xs tracking-wide">{selectedCountry?.dial ?? "+225"}</span>
                      <span className="text-zinc-500 text-xs">▾</span>
                    </button>
                    <input {...field} type="tel" autoComplete="tel" className="flex-1 bg-transparent border-none px-4 text-white focus:outline-none placeholder:text-zinc-500 text-sm rounded-r-full" placeholder="07 01 23 45 67" />
                    {showCountryPicker && (
                      <div className="absolute top-full left-0 mt-1 w-72 bg-card border border-card-border rounded-xl shadow-2xl z-50 overflow-hidden">
                        <div className="p-2 border-b border-card-border">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <input
                              type="text"
                              value={countrySearch}
                              onChange={e => setCountrySearch(e.target.value)}
                              placeholder="Rechercher un pays..."
                              className="w-full pl-8 pr-3 py-2 text-xs bg-secondary rounded-lg border-none focus:outline-none text-foreground placeholder:text-muted-foreground"
                              autoFocus
                            />
                          </div>
                        </div>
                        <div className="max-h-56 overflow-y-auto">
                          {filteredCountries.length === 0 ? (
                            <div className="py-6 text-center text-xs text-muted-foreground">Aucun pays trouvé</div>
                          ) : filteredCountries.map(c => (
                            <button
                              key={c.code}
                              type="button"
                              onClick={() => { setSelectedCountryCode(c.code); setShowCountryPicker(false); setCountrySearch(""); }}
                              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-secondary transition-colors ${selectedCountryCode === c.code ? "bg-primary/10 text-primary" : "text-foreground"}`}
                            >
                              <FlagImg code={c.code} />
                              <span className="flex-1 text-sm">{c.label}</span>
                              <span className="text-muted-foreground font-mono text-xs">{c.dial}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-foreground">Mot de passe <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <div className="relative h-14">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className="pl-11 pr-11 h-full rounded-full bg-zinc-900 border border-zinc-700/60 text-white placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:border-primary/60 transition-all duration-200 shadow-sm"
                      {...field}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(p => !p)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="confirmPassword" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-foreground">Confirmer le mot de passe <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <div className="relative h-14">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="••••••••"
                      className="pl-11 pr-11 h-full rounded-full bg-zinc-900 border border-zinc-700/60 text-white placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:border-primary/60 transition-all duration-200 shadow-sm"
                      {...field}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(p => !p)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* ── Code de parrainage (optionnel) ── */}
            <div>
              <label className="text-sm font-medium text-foreground flex items-center gap-1 mb-1.5">
                Code de parrainage
                <span className="text-muted-foreground text-xs font-normal">(optionnel)</span>
              </label>
              <div className="relative h-14">
                <Gift className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500" />
                <Input
                  value={referralCode}
                  onChange={e => setReferralCode(e.target.value.toUpperCase())}
                  placeholder="SXXXXXXXY"
                  maxLength={12}
                  className="pl-11 h-full rounded-full bg-zinc-900 border border-zinc-700/60 text-white placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:border-amber-500/60 transition-all duration-200 shadow-sm font-mono uppercase tracking-wider"
                />
              </div>
              {referralCode.trim().length > 0 && (
                <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
                  <Gift className="w-3 h-3" /> Code de parrainage appliqué
                </p>
              )}
            </div>

            <FormField control={form.control} name="terms" render={({ field }) => (
              <FormItem>
                <FormControl>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <div
                      onClick={() => field.onChange(!field.value)}
                      className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center border-2 transition-colors flex-shrink-0 ${field.value ? "bg-primary border-primary" : "border-card-border bg-card"}`}
                    >
                      {field.value && <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <span className="text-sm text-muted-foreground leading-relaxed">
                      J'accepte les{" "}
                      <Link href="/legal/cgu" className="text-primary hover:underline font-medium">conditions d'utilisation</Link>
                      {" "}et la{" "}
                      <Link href="/legal/politique-confidentialite" className="text-primary hover:underline font-medium">politique de confidentialité</Link>
                    </span>
                  </label>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <TurnstileWidget onSuccess={handleTurnstileSuccess} onExpire={handleTurnstileExpire} onError={handleTurnstileError} />
            <Button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full h-14 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-base mt-2"
            >
              {registerMutation.isPending ? (
                <span className="flex items-center gap-2"><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Création en cours...</span>
              ) : "Créer mon compte gratuitement"}
            </Button>

          </form>
        </Form>

        <div className="mt-4">
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-card-border" />
            <span className="text-xs text-muted-foreground">ou</span>
            <div className="flex-1 h-px bg-card-border" />
          </div>
          <a
            href="/api/auth/google"
            className="flex items-center justify-center gap-3 w-full h-12 rounded-xl border border-card-border bg-card hover:bg-secondary text-sm font-medium text-foreground transition-colors"
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continuer avec Google
          </a>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Déjà un compte ?{" "}
          <Link href="/login" className="text-primary hover:underline font-semibold">Se connecter</Link>
        </p>
      </motion.div>
    </div>
  );
}
