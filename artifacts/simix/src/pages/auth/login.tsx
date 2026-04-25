import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { FaGoogle, FaApple, FaFacebook } from "react-icons/fa";
import { motion } from "framer-motion";

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
      
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col justify-center max-w-sm w-full mx-auto z-10">
        <div className="mb-8">
          <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center mb-6">
            <div className="w-6 h-6 bg-primary rounded-lg shadow-lg shadow-primary/50" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2 tracking-tight">Bon retour!</h1>
          <p className="text-muted-foreground text-sm">Connectez-vous pour continuer vers Simix</p>
        </div>

        <div className="flex p-1 bg-secondary rounded-xl mb-6">
          <button 
            type="button"
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${method === "phone" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
            onClick={() => { setMethod("phone"); form.reset(); }}
          >
            Téléphone
          </button>
          <button 
            type="button"
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${method === "username" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
            onClick={() => { setMethod("username"); form.reset(); }}
          >
            Nom d'utilisateur
          </button>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="identifier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{method === "phone" ? "Numéro de téléphone" : "Nom d'utilisateur"}</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder={method === "phone" ? "+225 01 02 03 04 05" : "Entrez votre nom d'utilisateur"} 
                      className="bg-card border-card-border focus-visible:ring-primary h-12"
                      {...field} 
                    />
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
                  <FormLabel>Mot de passe</FormLabel>
                  <FormControl>
                    <Input 
                      type="password" 
                      placeholder="••••••••" 
                      className="bg-card border-card-border focus-visible:ring-primary h-12"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex justify-end mt-2 mb-6">
              <Link href="#" className="text-sm text-primary font-medium">Mot de passe oublié?</Link>
            </div>

            <Button type="submit" className="w-full h-14 rounded-xl text-md font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? "Connexion..." : "Se connecter"}
            </Button>
          </form>
        </Form>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-card-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Ou continuer avec</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Button variant="outline" className="h-12 bg-card border-card-border hover:bg-secondary">
            <FaGoogle className="w-5 h-5 text-foreground" />
          </Button>
          <Button variant="outline" className="h-12 bg-card border-card-border hover:bg-secondary">
            <FaApple className="w-5 h-5 text-foreground" />
          </Button>
          <Button variant="outline" className="h-12 bg-card border-card-border hover:bg-secondary">
            <FaFacebook className="w-5 h-5 text-[#1877F2]" />
          </Button>
        </div>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          Vous n'avez pas de compte?{" "}
          <Link href="/register" className="text-primary font-semibold">S'inscrire</Link>
        </div>
      </motion.div>
    </div>
  );
}
