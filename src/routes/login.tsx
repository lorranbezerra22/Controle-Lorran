import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : "",
  }),
  head: () => ({ meta: [{ title: "Entrar — Gestão Família" }] }),
});

function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup" | "admin-create">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [signupAllowed, setSignupAllowed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
  const { next } = Route.useSearch();

  const goNext = () => {
    if (next) window.location.href = next;
    else navigate({ to: "/" });
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      if (!session) return;

      if (session.user.email?.toLowerCase() === "lorranbezerra876@gmail.com") {
        setIsAdmin(true);
      } else {
        goNext();
      }
    });
    supabase.rpc("signup_allowed").then(({ data }) => setSignupAllowed(!!data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "admin-create") {
        if (!isAdmin) throw new Error("Somente o administrador pode criar novos acessos.");
        const { data, error } = await supabase.functions.invoke("admin-create-user", {
          body: { email, password },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast.success("Acesso criado. Sua esposa já pode entrar com esse email e senha.");
        setEmail("");
        setPassword("");
      } else if (mode === "signup") {
        if (!signupAllowed) throw new Error("Cadastro desabilitado. Modo pessoal já configurado.");
        const redirectTo = next ? `${window.location.origin}${next}` : `${window.location.origin}/`;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name }, emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        toast.success("Conta criada! Bem-vindo.");
        goNext();
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (email.trim().toLowerCase() === "lorranbezerra876@gmail.com") {
          setIsAdmin(true);
          setMode("admin-create");
        } else {
          goNext();
        }
      }
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-background">
      <div
        className="absolute inset-0 z-0 opacity-40"
        style={{ background: "var(--gradient-primary)", filter: "blur(120px) opacity(.35)" }}
      />
      <div className="w-full max-w-md z-10">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-tight text-foreground drop-shadow-lg">Gestão Família</h1>
          <p className="text-muted-foreground mt-2 text-sm font-medium">Controle financeiro pessoal e familiar</p>
        </div>

        <div className="bg-card/95 backdrop-blur-md border border-border rounded-2xl p-6" style={{ boxShadow: "var(--shadow-elegant)" }}>
          {(signupAllowed || isAdmin) && (
            <div className="flex gap-2 mb-6 p-1 bg-muted/50 rounded-lg">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`flex-1 py-2 text-sm rounded-md transition-colors ${mode === "signin" ? "bg-card text-foreground" : "text-muted-foreground"}`}
              >Entrar</button>
              {signupAllowed && (
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className={`flex-1 py-2 text-sm rounded-md transition-colors ${mode === "signup" ? "bg-card text-foreground" : "text-muted-foreground"}`}
                >Criar conta</button>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setMode("admin-create")}
                  className={`flex-1 py-2 text-sm rounded-md transition-colors ${mode === "admin-create" ? "bg-card text-foreground" : "text-muted-foreground"}`}
                >Novo acesso</button>
              )}
            </div>
          )}

          {mode === "admin-create" && (
            <p className="mb-4 text-sm text-muted-foreground">
              Crie o email e a senha que sua esposa usará para acessar o CRM.
            </p>
          )}

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && signupAllowed && (
              <div className="space-y-2">
                <Label htmlFor="name">Seu nome</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Aguarde…" : mode === "signin" ? "Entrar" : mode === "admin-create" ? "Criar acesso" : "Criar conta"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
