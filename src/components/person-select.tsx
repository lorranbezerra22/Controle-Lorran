import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePeople } from "@/lib/queries";

interface Props {
  value: string;
  onChange: (v: string) => void;
  includeFamilia?: boolean;
  placeholder?: string;
  allowEmpty?: boolean;
}

export function PersonSelect({ value, onChange, includeFamilia = true, placeholder = "Pessoa", allowEmpty = false }: Props) {
  const { data: people = [] } = usePeople();
  const names = new Set<string>();
  people.forEach((p: any) => p?.name && names.add(p.name));
  if (includeFamilia) names.add("Família");
  const list = Array.from(names);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {allowEmpty && <SelectItem value="__none">— sem pessoa —</SelectItem>}
        {list.map((n) => (
          <SelectItem key={n} value={n}>{n}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
