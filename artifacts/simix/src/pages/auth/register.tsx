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
import { Eye, EyeOff, ChevronLeft, Shield, User, Mail, Lock, AtSign, Search } from "lucide-react";
import { FaGoogle } from "react-icons/fa";
import { motion } from "framer-motion";
import { SimixLogo } from "@/components/simix-logo";

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
  { code: "fr", dial: "+33", label: "France", flag: "🇫🇷" },
  { code: "gb", dial: "+44", label: "Royaume-Uni", flag: "🇬🇧" },
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [selectedCountryCode, setSelectedCountryCode] = useState("ci");
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");

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
        }
      }) as { requiresEmailVerification?: boolean };
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      if (result?.requiresEmailVerification) {
        setLocation("/verify-email");
      } else {
        setLocation("/dashboard");
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
                    <Input placeholder="Jean Konan" className="pl-11 bg-card border-card-border focus-visible:ring-primary h-full rounded-xl" {...field} />
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
                    <Input type="email" placeholder="jean@exemple.com" className="pl-11 bg-card border-card-border focus-visible:ring-primary h-full rounded-xl" {...field} />
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
                    <Input placeholder="jeankonan" className="pl-11 bg-card border-card-border focus-visible:ring-primary h-full rounded-xl" {...field} />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-foreground">Téléphone <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <div className="flex h-14 bg-card border border-card-border rounded-xl overflow-visible focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all relative">
                    <button
                      type="button"
                      onClick={() => { setShowCountryPicker(p => !p); setCountrySearch(""); }}
                      className="flex items-center gap-1.5 px-3 bg-secondary/50 border-r border-card-border text-sm font-medium text-foreground hover:bg-secondary transition-colors shrink-0 rounded-l-xl"
                    >
                      <FlagImg code={selectedCountry?.code ?? "ci"} />
                      <span className="font-mono text-xs">{selectedCountry?.dial ?? "+225"}</span>
                      <span className="text-muted-foreground text-xs">▾</span>
                    </button>
                    <input {...field} type="tel" autoComplete="tel" className="flex-1 bg-transparent border-none px-3 text-foreground focus:outline-none placeholder:text-muted-foreground text-sm rounded-r-xl" placeholder="07 01 23 45 67" />
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
                      className="pl-11 pr-11 bg-card border-card-border focus-visible:ring-primary h-full rounded-xl"
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
                      className="pl-11 pr-11 bg-card border-card-border focus-visible:ring-primary h-full rounded-xl"
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
                      <Link href="/legal/terms" className="text-primary hover:underline font-medium">conditions d'utilisation</Link>
                      {" "}et la{" "}
                      <Link href="/legal/privacy" className="text-primary hover:underline font-medium">politique de confidentialité</Link>
                    </span>
                  </label>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <Button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full h-14 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-base mt-2"
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
            className="flex items-center justify-center gap-3 w-full h-12 rounded-xl border border-card-border bg-card hover:bg-card/80 text-sm font-medium text-foreground transition-colors"
          >
            <FaGoogle className="w-4 h-4 text-[#4285F4]" />
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
