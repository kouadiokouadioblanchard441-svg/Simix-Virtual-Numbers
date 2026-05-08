import { useState, useMemo } from "react";
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
import { motion } from "framer-motion";

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

const ALL_COUNTRIES = [
  { code: "ci", dial: "+225", label: "Côte d'Ivoire" },
  { code: "sn", dial: "+221", label: "Sénégal" },
  { code: "ml", dial: "+223", label: "Mali" },
  { code: "bf", dial: "+226", label: "Burkina Faso" },
  { code: "gn", dial: "+224", label: "Guinée" },
  { code: "tg", dial: "+228", label: "Togo" },
  { code: "bj", dial: "+229", label: "Bénin" },
  { code: "ne", dial: "+227", label: "Niger" },
  { code: "cm", dial: "+237", label: "Cameroun" },
  { code: "ng", dial: "+234", label: "Nigéria" },
  { code: "gh", dial: "+233", label: "Ghana" },
  { code: "ke", dial: "+254", label: "Kenya" },
  { code: "tz", dial: "+255", label: "Tanzanie" },
  { code: "ug", dial: "+256", label: "Ouganda" },
  { code: "rw", dial: "+250", label: "Rwanda" },
  { code: "ma", dial: "+212", label: "Maroc" },
  { code: "dz", dial: "+213", label: "Algérie" },
  { code: "tn", dial: "+216", label: "Tunisie" },
  { code: "eg", dial: "+20", label: "Égypte" },
  { code: "ly", dial: "+218", label: "Libye" },
  { code: "sd", dial: "+249", label: "Soudan" },
  { code: "ss", dial: "+211", label: "Soudan du Sud" },
  { code: "et", dial: "+251", label: "Éthiopie" },
  { code: "so", dial: "+252", label: "Somalie" },
  { code: "dj", dial: "+253", label: "Djibouti" },
  { code: "er", dial: "+291", label: "Érythrée" },
  { code: "za", dial: "+27", label: "Afrique du Sud" },
  { code: "mz", dial: "+258", label: "Mozambique" },
  { code: "zm", dial: "+260", label: "Zambie" },
  { code: "zw", dial: "+263", label: "Zimbabwe" },
  { code: "mw", dial: "+265", label: "Malawi" },
  { code: "bw", dial: "+267", label: "Botswana" },
  { code: "na", dial: "+264", label: "Namibie" },
  { code: "sz", dial: "+268", label: "Eswatini" },
  { code: "ls", dial: "+266", label: "Lesotho" },
  { code: "mg", dial: "+261", label: "Madagascar" },
  { code: "mu", dial: "+230", label: "Maurice" },
  { code: "sc", dial: "+248", label: "Seychelles" },
  { code: "km", dial: "+269", label: "Comores" },
  { code: "ga", dial: "+241", label: "Gabon" },
  { code: "gq", dial: "+240", label: "Guinée Équatoriale" },
  { code: "st", dial: "+239", label: "Sao Tomé-et-Príncipe" },
  { code: "cf", dial: "+236", label: "Centrafrique" },
  { code: "td", dial: "+235", label: "Tchad" },
  { code: "cg", dial: "+242", label: "Congo" },
  { code: "cd", dial: "+243", label: "Congo RDC" },
  { code: "ao", dial: "+244", label: "Angola" },
  { code: "gw", dial: "+245", label: "Guinée-Bissau" },
  { code: "cv", dial: "+238", label: "Cap-Vert" },
  { code: "gm", dial: "+220", label: "Gambie" },
  { code: "sl", dial: "+232", label: "Sierra Leone" },
  { code: "lr", dial: "+231", label: "Liberia" },
  { code: "bi", dial: "+257", label: "Burundi" },
  { code: "mr", dial: "+222", label: "Mauritanie" },
  { code: "fr", dial: "+33", label: "France" },
  { code: "gb", dial: "+44", label: "Royaume-Uni" },
  { code: "be", dial: "+32", label: "Belgique" },
  { code: "us", dial: "+1", label: "États-Unis" },
  { code: "ca", dial: "+1", label: "Canada" },
];

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

  const selectedCountry = ALL_COUNTRIES.find(c => c.code === selectedCountryCode) ?? ALL_COUNTRIES[0];

  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return ALL_COUNTRIES;
    return ALL_COUNTRIES.filter(c =>
      c.label.toLowerCase().includes(countrySearch.toLowerCase()) ||
      c.dial.includes(countrySearch)
    );
  }, [countrySearch]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { fullName: "", email: "", username: "", phone: "", password: "", confirmPassword: "", terms: false },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      await registerMutation.mutateAsync({
        data: {
          fullName: values.fullName,
          phone: values.phone,
          password: values.password,
          countryCode: selectedCountry.dial,
          email: values.email,
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setLocation("/dashboard");
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Une erreur est survenue";
      toast({ title: "Erreur d'inscription", description: msg, variant: "destructive" });
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col px-6 py-6 relative overflow-y-auto">
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="flex items-center justify-between mb-6 z-10">
        <Link href="/login" className="w-10 h-10 rounded-xl bg-card border border-card-border flex items-center justify-center text-foreground hover:bg-secondary transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <span className="text-base font-bold text-foreground">Créer un compte</span>
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
                      <FlagImg code={selectedCountry.code} />
                      <span className="font-mono text-xs">{selectedCountry.dial}</span>
                      <span className="text-muted-foreground text-xs">▾</span>
                    </button>
                    <input {...field} type="tel" className="flex-1 bg-transparent border-none px-3 text-foreground focus:outline-none placeholder:text-muted-foreground text-sm rounded-r-xl" placeholder="07 01 23 45 67" />
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
                    <Input type={showPassword ? "text" : "password"} placeholder="Minimum 6 caractères" autoComplete="new-password" className="pl-11 pr-12 bg-card border-card-border focus-visible:ring-primary h-full rounded-xl" {...field} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
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
                    <Input type={showConfirmPassword ? "text" : "password"} placeholder="Répétez votre mot de passe" autoComplete="new-password" className="pl-11 pr-12 bg-card border-card-border focus-visible:ring-primary h-full rounded-xl" {...field} />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="terms" render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-3 space-y-0 pt-1">
                <FormControl>
                  <input type="checkbox" className="w-5 h-5 mt-0.5 rounded border-card-border bg-card text-primary focus:ring-primary accent-primary" checked={field.value} onChange={field.onChange} />
                </FormControl>
                <div className="leading-tight">
                  <FormLabel className="text-sm text-muted-foreground font-normal cursor-pointer">
                    J'accepte les <Link href="#" className="text-primary hover:underline">Conditions d'utilisation</Link> et la <Link href="#" className="text-primary hover:underline">Politique de confidentialité</Link>
                  </FormLabel>
                  <FormMessage />
                </div>
              </FormItem>
            )} />

            <div className="pt-2">
              <Button
                type="submit"
                className="w-full h-14 rounded-2xl text-base font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white shadow-lg shadow-primary/25"
                disabled={registerMutation.isPending}
              >
                {registerMutation.isPending ? "Création en cours..." : "Créer mon compte gratuitement"}
              </Button>
            </div>
          </form>
        </Form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-card-border" /></div>
          <div className="relative flex justify-center text-xs tracking-wider font-medium text-muted-foreground uppercase">
            <span className="bg-background px-4">Ou continuer avec</span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <a href="/api/auth/google" className="w-full">
            <Button
              type="button"
              variant="outline"
              className="w-full h-12 bg-card border-card-border hover:bg-secondary rounded-xl gap-3 text-sm font-medium text-foreground"
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              S'inscrire avec Google
            </Button>
          </a>
        </div>

        <div className="mt-6 text-center text-sm font-medium text-muted-foreground">
          Vous avez déjà un compte ?{" "}
          <Link href="/login" className="text-primary hover:underline font-semibold">Se connecter</Link>
        </div>
      </motion.div>
    </div>
  );
}
