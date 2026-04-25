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
import { motion } from "framer-motion";

const formSchema = z.object({
  fullName: z.string().min(2, "Le nom complet est requis"),
  phone: z.string().min(6, "Le numéro de téléphone est requis"),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
});

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const registerMutation = useRegister();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      password: "",
      confirmPassword: "",
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
    <div className="min-h-[100dvh] bg-background flex flex-col px-6 py-10 relative overflow-y-auto">
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 blur-[100px] rounded-full pointer-events-none" />
      
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col justify-center max-w-sm w-full mx-auto z-10 my-auto">
        <div className="mb-6">
          <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center mb-6">
            <div className="w-6 h-6 bg-primary rounded-lg shadow-lg shadow-primary/50" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2 tracking-tight">Créer un compte</h1>
          <p className="text-muted-foreground text-sm">Rejoignez Simix aujourd'hui</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom complet</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Jean Dupont" 
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
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Numéro de téléphone</FormLabel>
                  <FormControl>
                    <div className="flex">
                      <div className="flex items-center justify-center bg-secondary border border-card-border border-r-0 rounded-l-md px-3 text-sm text-foreground">
                        +225
                      </div>
                      <Input 
                        placeholder="01 02 03 04 05" 
                        className="bg-card border-card-border focus-visible:ring-primary h-12 rounded-l-none"
                        {...field} 
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
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirmer le mot de passe</FormLabel>
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

            <div className="pt-2">
              <Button type="submit" className="w-full h-14 rounded-xl text-md font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? "Inscription..." : "S'inscrire"}
              </Button>
            </div>
          </form>
        </Form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-card-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Ou</span>
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
          Vous avez déjà un compte?{" "}
          <Link href="/login" className="text-primary font-semibold">Se connecter</Link>
        </div>
      </motion.div>
    </div>
  );
}
