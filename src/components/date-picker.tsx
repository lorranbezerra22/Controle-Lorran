import { Input } from "@/components/ui/input";

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  id?: string;
}

export function DatePicker({ value, onChange, className, id }: Props) {
  return (
    <Input id={id} type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={className} />
  );
}

interface MProps {
  monthIndex: number;
  year: number;
  onChange: (month: number, year: number) => void;
  className?: string;
}

export function MonthPicker({ monthIndex, year, onChange, className }: MProps) {
  const value = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  return (
    <Input
      type="month"
      value={value}
      onChange={(e) => {
        const [y, m] = e.target.value.split("-").map(Number);
        onChange((m || 1) - 1, y || year);
      }}
      className={className}
    />
  );
}
