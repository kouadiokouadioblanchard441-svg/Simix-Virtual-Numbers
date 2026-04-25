import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { FaGoogle, FaApple, FaFacebook } from "react-icons/fa";
import { Phone, User, Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";
import { SimixLogo } from "@/components/simix-logo";

const formSchema = z.object({
  identifier: z.string().min(3, "L'identifiant est requis"),
  password: z.string().min(6, "Le mot de passe est requis"),
});

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const loginMutation = useLogin();
  const [method, setMethod] = useState<"phone" | "username">("phone");
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      identifier: "",
      password: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      await loginMutation.mutateAsync({
        data: {
          identifier: values.identifier,
          password: values.password,
          method,
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setLocation("/dashboard");
    } catch (error: any) {
      toast({
        title: "Erreur de connexion",
        description: error?.message || "Identifiants incorrects",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col px-6 py-12 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] rounded-full pointer-events-none" />
      
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col max-w-sm w-full mx-auto z-10 pt-4">
        <div className="flex justify-center mb-10">
          <SimixLogo size={28} />
        </div>
        
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">Connexion</h1>
          <p className="text-foreground text-base font-semibold mb-1">Bienvenue de retour !</p>
          <p className="text-sm text-muted-foreground">Connectez-vous à votre compte pour continuer.</p>
        </div>

        <div className="flex p-1 bg-card border border-card-border rounded-full mb-8 h-12 items-center">
          <button 
            type="button"
            className={`flex-1 h-full flex items-center justify-center gap-2 text-sm font-medium rounded-full transition-all ${method === "phone" ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md" : "text-muted-foreground"}`}
            onClick={() => { setMethod("phone"); form.reset(); }}
          >
            <Phone className="w-4 h-4" /> Téléphone
          </button>
          <button 
            type="button"
            className={`flex-1 h-full flex items-center justify-center gap-2 text-sm font-medium rounded-full transition-all ${method === "username" ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md" : "text-muted-foreground"}`}
            onClick={() => { setMethod("username"); form.reset(); }}
          >
            <User className="w-4 h-4" /> Nom d'utilisateur
          </button>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="identifier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-foreground">{method === "phone" ? "Numéro de téléphone" : "Nom d'utilisateur"}</FormLabel>
                  <FormControl>
                    {method === "phone" ? (
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
                    ) : (
                      <Input 
                        placeholder="Entrez votre nom d'utilisateur" 
                        className="bg-card border-card-border focus-visible:ring-primary h-14 rounded-xl"
                        {...field} 
                      />
                    )}
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
            
            <div className="flex justify-end pt-1 mb-6">
              <Link href="#" className="text-sm text-primary font-medium">Mot de passe oublié ?</Link>
            </div>

            <Button type="submit" className="w-full h-14 rounded-2xl text-base font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white shadow-lg shadow-primary/25" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? "Connexion..." : "Se connecter"}
            </Button>
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

        <div className="mt-auto pt-8 text-center text-sm font-medium text-muted-foreground">
          Pas de compte ?{" "}
          <Link href="/register" className="text-primary hover:underline">S'inscrire</Link>
        </div>
      </motion.div>
    </div>
  );
}
