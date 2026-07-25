import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePeople } from "@/lib/queries";

interface Props {
  value?: string;
  onChange: (v: string) => void;
  includeFamilia?: boolean;
  placeholder?: string;
  allowEmpty?: boolean;
  extras?: string[];
  multiSelect?: boolean;
  selectedValues?: string[];
}

import { Check } from "lucide-react";

export function PersonSelect({ 
  value, 
  onChange, 
  includeFamilia = true, 
  placeholder = "Pessoa", 
  allowEmpty = false, 
  extras = [],
  multiSelect = false,
  selectedValues = []
}: Props) {
  const { data: people = [] } = usePeople();
  const names = new Set<string>();
  people.forEach((p: any) => {
    if (!p?.name) return;
    // Se a pessoa for "Familia" ou "Família", não adicionamos aqui 
    // porque ela será adicionada manualmente com a capitalização correta abaixo
    if (p.name.localeCompare("familia", "pt-BR", { sensitivity: "base" }) === 0) {
      names.add("Familia");
      return;
    }
    names.add(p.name);
  });
  
  if (includeFamilia) names.add("Familia");
  extras.forEach((n) => {
    if (!n) return;
    if (n.localeCompare("familia", "pt-BR", { sensitivity: "base" }) === 0) return;
    names.add(n);
  });
  const list = Array.from(names).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }));

  if (multiSelect) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {list.map((n) => {
          const active = selectedValues.includes(n);
          return (
            <button
              key={n}
              type="button"
              onClick={() => {
                if (active) {
                  onChange(selectedValues.filter((v) => v !== n).join(","));
                } else {
                  onChange([...selectedValues, n].join(","));
                }
              }}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs border transition-all ${
                active 
                  ? "border-primary bg-primary text-primary-foreground shadow-sm" 
                  : "border-border bg-background hover:border-primary/40"
              }`}
            >
              {active && <Check className="w-3 h-3" />}
              {n}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10 rounded-xl border-border bg-background/50 shadow-sm transition-all hover:border-primary/50">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty && <SelectItem value="__none">— sem pessoa —</SelectItem>}
        {list.map((n) => (
          <SelectItem key={n} value={n}>{n}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
