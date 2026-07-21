import { forwardRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export async function correctText(text: string): Promise<string> {
  if (!text || !text.trim() || text.length > 500) return text;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return text;
    const r = await fetch(`${SUPABASE_URL}/functions/v1/spellcheck`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text }),
    });
    if (!r.ok) return text;
    const j = await r.json();
    return (j?.text || text).toString();
  } catch {
    return text;
  }
}

type Props = {
  value: string;
  onChange: (v: string) => void;
  autoCorrect?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">;

export const SmartInput = forwardRef<HTMLInputElement, Props>(function SmartInput(
  { value, onChange, autoCorrect = true, onBlur, ...rest },
  ref,
) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="relative">
      <Input
        {...rest}
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck
        lang="pt-BR"
        onBlur={async (e) => {
          onBlur?.(e);
          if (!autoCorrect) return;
          const v = e.target.value;
          if (!v.trim()) return;
          setBusy(true);
          const corrected = await correctText(v);
          setBusy(false);
          if (corrected && corrected !== v) onChange(corrected);
        }}
      />
      {busy && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
});

type TProps = {
  value: string;
  onChange: (v: string) => void;
  autoCorrect?: boolean;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">;

export const SmartTextarea = forwardRef<HTMLTextAreaElement, TProps>(function SmartTextarea(
  { value, onChange, autoCorrect = true, onBlur, ...rest },
  ref,
) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="relative">
      <Textarea
        {...rest}
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck
        lang="pt-BR"
        onBlur={async (e) => {
          onBlur?.(e);
          if (!autoCorrect) return;
          const v = e.target.value;
          if (!v.trim()) return;
          setBusy(true);
          const corrected = await correctText(v);
          setBusy(false);
          if (corrected && corrected !== v) onChange(corrected);
        }}
      />
      {busy && <Loader2 className="absolute right-2 top-2 w-3.5 h-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
});
