import { useState } from "react";
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
import { Eye, EyeOff, ChevronLeft, Shield, User, Mail, Phone, Lock, AtSign } from "lucide-react";
import { motion } from "framer-motion";

const formSchema = z.object({
  fullName: z.string().min(2, "Le nom complet est requis (min 2 caractères)"),
  email: z.string().email("Adresse email invalide"),
  username: z.string().min(3, "Le nom d'utilisateur doit faire au moins 3 caractères").max(20, "Max 20 caractères").regex(/^[a-zA-Z0-9_]+$/, "Lettres, chiffres et _ uniquement").optional().or(z.literal("")),
  phone: z.string().min(6, "Le numéro de téléphone est requis"),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
  confirmPassword: z.string(),
  terms: z.boolean().refine((val) => val === true, { message: "Vous devez accepter les conditions" }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
});

const COUNTRY_CODES = [
  { flag: "🇨🇮", code: "+225", label: "Côte d'Ivoire" },
  { flag: "🇸🇳", code: "+221", label: "Sénégal" },
  { flag: "🇲🇱", code: "+223", label: "Mali" },
  { flag: "🇧🇫", code: "+226", label: "Burkina Faso" },
  { flag: "🇬🇳", code: "+224", label: "Guinée" },
  { flag: "🇹🇬", code: "+228", label: "Togo" },
  { flag: "🇧🇯", code: "+229", label: "Bénin" },
  { flag: "🇳🇪", code: "+227", label: "Niger" },
  { flag: "🇨🇲", code: "+237", label: "Cameroun" },
  { flag: "🇫🇷", code: "+33", label: "France" },
  { flag: "🌍", code: "+1", label: "Autre" },
];

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const registerMutation = useRegister();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [selectedCountryCode, setSelectedCountryCode] = useState("+225");
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  const selectedCountry = COUNTRY_CODES.find(c => c.code === selectedCountryCode) ?? COUNTRY_CODES[0];

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
          countryCode: selectedCountryCode,
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
          <h1 className="text-2xl font-bold text-foreground mb-1">Bienvenue sur Simix !</h1>
          <p className="text-sm text-muted-foreground">Inscrivez-vous gratuitement en quelques secondes.</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

            {/* Full Name */}
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

            {/* Email */}
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

            {/* Username (optional) */}
            <FormField control={form.control} name="username" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-foreground flex items-center gap-1">
                  Nom d'utilisateur <span className="text-muted-foreground text-xs font-normal">(optionnel)</span>
                </FormLabel>
                <FormControl>
                  <div className="relative h-14">
                    <AtSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="jean_konan" className="pl-11 bg-card border-card-border focus-visible:ring-primary h-full rounded-xl" {...field} />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Phone */}
            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-foreground">Téléphone <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <div className="flex h-14 bg-card border border-card-border rounded-xl overflow-hidden focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all relative">
                    <button
                      type="button"
                      onClick={() => setShowCountryPicker(p => !p)}
                      className="flex items-center gap-1.5 px-3 bg-secondary/50 border-r border-card-border text-sm font-medium text-foreground hover:bg-secondary transition-colors shrink-0"
                    >
                      <span>{selectedCountry.flag}</span>
                      <span>{selectedCountry.code}</span>
                      <span className="text-muted-foreground text-xs">▾</span>
                    </button>
                    <input {...field} type="tel" className="flex-1 bg-transparent border-none px-3 text-foreground focus:outline-none placeholder:text-muted-foreground text-sm" placeholder="0701234567" />
                    {showCountryPicker && (
                      <div className="absolute top-full left-0 mt-1 w-64 bg-card border border-card-border rounded-xl shadow-xl z-50 overflow-hidden">
                        {COUNTRY_CODES.map(c => (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => { setSelectedCountryCode(c.code); setShowCountryPicker(false); }}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-secondary transition-colors ${selectedCountryCode === c.code ? "bg-primary/10 text-primary" : "text-foreground"}`}
                          >
                            <span>{c.flag}</span>
                            <span className="flex-1">{c.label}</span>
                            <span className="text-muted-foreground font-mono">{c.code}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Password */}
            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-foreground">Mot de passe <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <div className="relative h-14">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input type={showPassword ? "text" : "password"} placeholder="••••••••" className="pl-11 pr-12 bg-card border-card-border focus-visible:ring-primary h-full rounded-xl" {...field} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Confirm Password */}
            <FormField control={form.control} name="confirmPassword" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-foreground">Confirmer le mot de passe <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <div className="relative h-14">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input type={showConfirmPassword ? "text" : "password"} placeholder="••••••••" className="pl-11 pr-12 bg-card border-card-border focus-visible:ring-primary h-full rounded-xl" {...field} />
                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Terms */}
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
            <span className="bg-background px-4">OU CONTINUER AVEC</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="h-12 bg-card border-card-border hover:bg-secondary rounded-xl gap-2 text-sm font-medium text-foreground">
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Google
          </Button>
          <Button variant="outline" className="h-12 bg-card border-card-border hover:bg-secondary rounded-xl gap-2 text-sm font-medium text-foreground">
            <Phone className="w-4 h-4" />
            SMS OTP
          </Button>
        </div>

        <div className="mt-6 text-center text-sm font-medium text-muted-foreground">
          Déjà un compte ?{" "}
          <Link href="/login" className="text-primary hover:underline font-semibold">Se connecter</Link>
        </div>
      </motion.div>
    </div>
  );
}
