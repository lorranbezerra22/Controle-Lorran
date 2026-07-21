import * as React from "react";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DatePickerProps {
  /** ISO date string YYYY-MM-DD */
  value?: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  className?: string;
}

export function DatePicker({ value, onChange, placeholder = "Escolha uma data", className }: DatePickerProps) {
  const date = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal bg-background border-border",
            !date && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date ? format(date, "dd 'de' MMM, yyyy", { locale: ptBR }) : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => d && onChange(format(d, "yyyy-MM-dd"))}
          initialFocus
          locale={ptBR}
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}

interface MonthPickerProps {
  /** YYYY-MM */
  value: string;
  onChange: (month: string) => void;
  className?: string;
  iconOnly?: boolean;
}

export function MonthPicker({ value, onChange, className, iconOnly }: MonthPickerProps) {
  const date = value ? parse(value + "-01", "yyyy-MM-dd", new Date()) : new Date();
  const [open, setOpen] = React.useState(false);
  const [viewYear, setViewYear] = React.useState(date.getFullYear());
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const selectedKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {iconOnly ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", className)}
            title={format(date, "MMMM 'de' yyyy", { locale: ptBR })}
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className={cn("w-full justify-start text-left font-normal bg-background border-border", className)}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {format(date, "MMMM 'de' yyyy", { locale: ptBR })}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 pointer-events-auto" align="start">
        <div className="flex items-center justify-between mb-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => setViewYear(viewYear - 1)}>‹</Button>
          <span className="font-medium text-sm">{viewYear}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setViewYear(viewYear + 1)}>›</Button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {months.map((m, i) => {
            const key = `${viewYear}-${String(i + 1).padStart(2, "0")}`;
            const active = key === selectedKey;
            return (
              <Button
                key={m}
                type="button"
                variant={active ? "default" : "ghost"}
                size="sm"
                onClick={() => { onChange(key); setOpen(false); }}
                className="text-xs"
              >
                {m}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
