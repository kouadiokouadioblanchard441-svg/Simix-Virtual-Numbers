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
import { FaGoogle, FaApple, FaFacebook } from "react-icons/fa";
import { Eye, EyeOff, ChevronLeft, Shield } from "lucide-react";
import { motion } from "framer-motion";

const formSchema = z.object({
  fullName: z.string().min(2, "Le nom complet est requis"),
  phone: z.string().min(6, "Le numéro de téléphone est requis"),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
  confirmPassword: z.string(),
  terms: z.boolean().refine((val) => val === true, {
    message: "Vous devez accepter les conditions",
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
});

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const registerMutation = useRegister();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      password: "",
      confirmPassword: "",
      terms: false,
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      await registerMutation.mutateAsync({
        data: {
          fullName: values.fullName,
          phone: values.phone,
          password: values.password,
          countryCode: "+225", // Default
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setLocation("/dashboard");
    } catch (error: any) {
      toast({
        title: "Erreur d'inscription",
        description: error?.message || "Une erreur est survenue",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col px-6 py-6 relative overflow-y-auto">
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] rounded-full pointer-events-none" />
      
      <div className="flex items-center justify-between mb-8 z-10">
        <Link href="/login" className="w-10 h-10 rounded-full flex items-center justify-center text-foreground hover:bg-secondary transition-colors">
          <ChevronLeft className="w-6 h-6" />
        </Link>
        <span className="text-base font-bold text-foreground">Inscription</span>
        <div className="w-10 h-10 rounded-full border border-primary/30 flex items-center justify-center bg-primary/10">
          <Shield className="w-4 h-4 text-primary" />
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col max-w-sm w-full mx-auto z-10 pb-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">Créer un compte</h1>
          <p className="text-sm text-muted-foreground">Inscrivez-vous en quelques secondes.</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-foreground">Nom complet</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Entrez votre nom complet" 
                      className="bg-card border-card-border focus-visible:ring-primary h-14 rounded-xl placeholder:text-muted-foreground"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-foreground">Numéro de téléphone</FormLabel>
                  <FormControl>
                    <div className="flex h-14 bg-card border border-card-border rounded-xl overflow-hidden focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all">
                      <div className="flex items-center justify-center px-4 bg-card border-r border-card-border text-sm font-medium text-foreground cursor-pointer hover:bg-secondary transition-colors">
                        <span className="mr-1">🇨🇮</span> +225 ▾
                      </div>
                      <input
                        {...field}
                        className="flex-1 bg-transparent border-none px-4 text-foreground focus:outline-none placeholder:text-muted-foreground"
                        placeholder="0701234567"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-foreground">Mot de passe</FormLabel>
                  <FormControl>
                    <div className="relative h-14">
                      <Input 
                        type={showPassword ? "text" : "password"} 
                        placeholder="••••••••" 
                        className="bg-card border-card-border focus-visible:ring-primary h-full rounded-xl pr-12"
                        {...field} 
                      />
                      <button 
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-foreground">Confirmer le mot de passe</FormLabel>
                  <FormControl>
                    <div className="relative h-14">
                      <Input 
                        type={showConfirmPassword ? "text" : "password"} 
                        placeholder="••••••••" 
                        className="bg-card border-card-border focus-visible:ring-primary h-full rounded-xl pr-12"
                        {...field} 
                      />
                      <button 
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="terms"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 pt-2">
                  <FormControl>
                    <div className="flex items-center mt-1">
                      <input 
                        type="checkbox" 
                        className="w-5 h-5 rounded border-card-border bg-card text-primary focus:ring-primary accent-primary"
                        checked={field.value}
                        onChange={field.onChange}
                      />
                    </div>
                  </FormControl>
                  <div className="space-y-1 leading-tight">
                    <FormLabel className="text-sm text-muted-foreground font-normal">
                      J'accepte les <Link href="#" className="text-primary hover:underline">Conditions d'utilisation</Link> et la <Link href="#" className="text-primary hover:underline">Politique de confidentialité</Link>
                    </FormLabel>
                  </div>
                </FormItem>
              )}
            />

            <div className="pt-4">
              <Button type="submit" className="w-full h-14 rounded-2xl text-base font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white shadow-lg shadow-primary/25" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? "Inscription..." : "Créer mon compte"}
              </Button>
            </div>
          </form>
        </Form>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-card-border" />
          </div>
          <div className="relative flex justify-center text-xs tracking-wider font-medium text-muted-foreground uppercase">
            <span className="bg-background px-4">OU CONTINUER AVEC</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Button variant="outline" className="h-14 bg-card border-card-border hover:bg-secondary rounded-xl">
            <FaGoogle className="w-6 h-6 text-white" />
          </Button>
          <Button variant="outline" className="h-14 bg-card border-card-border hover:bg-secondary rounded-xl">
            <FaApple className="w-6 h-6 text-white" />
          </Button>
          <Button variant="outline" className="h-14 bg-card border-card-border hover:bg-secondary rounded-xl">
            <FaFacebook className="w-6 h-6 text-[#1877F2]" />
          </Button>
        </div>

        <div className="mt-8 text-center text-sm font-medium text-muted-foreground">
          Vous avez déjà un compte ?{" "}
          <Link href="/login" className="text-primary hover:underline">Se connecter</Link>
        </div>
      </motion.div>
    </div>
  );
}
