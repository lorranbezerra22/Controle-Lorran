import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (t === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = (typeof window !== "undefined" && (window.localStorage.getItem("theme") as Theme)) || "dark";
    setTheme(stored);
    applyTheme(stored);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    if (typeof window !== "undefined") window.localStorage.setItem("theme", next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
      title={theme === "dark" ? "Tema claro" : "Tema escuro"}
      className={cn(
        "inline-flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-card text-foreground hover:bg-accent/30 transition-colors",
        className
      )}
    >
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
