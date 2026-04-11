import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { InterruptResponseField } from "@shared/schema";

interface ResponseFieldFormProps {
  fields: InterruptResponseField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
}

export function ResponseFieldForm({ fields, values, onChange, errors = {}, disabled = false }: ResponseFieldFormProps) {
  const [multiSelectOpen, setMultiSelectOpen] = useState<Record<string, boolean>>({});

  if (fields.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic py-2">No response fields defined.</p>
    );
  }

  return (
    <div className="space-y-4" data-testid="response-field-form">
      {fields.map((field) => {
        const val = values[field.key];
        const error = errors[field.key];

        return (
          <div key={field.key} className="space-y-1.5" data-testid={`field-${field.key}`}>
            <Label className="text-xs font-medium flex items-center gap-1.5">
              {field.label}
              {field.required && <span className="text-red-500">*</span>}
              <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">{field.type}</Badge>
            </Label>

            {field.helpText && (
              <p className="text-[11px] text-muted-foreground">{field.helpText}</p>
            )}

            {(field.type === "text" || field.type === "number") && (
              field.uiComponent === "multiline" || field.uiComponent === "json_editor" || field.uiComponent === "code" ? (
                <Textarea
                  value={val !== undefined && val !== null ? String(val) : ""}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  disabled={disabled}
                  className={`text-sm min-h-[72px] ${field.uiComponent === "json_editor" || field.uiComponent === "code" ? "font-mono text-xs" : ""}`}
                  placeholder={field.defaultValue !== undefined ? String(field.defaultValue) : undefined}
                  data-testid={`textarea-field-${field.key}`}
                />
              ) : (
                <Input
                  type={field.type === "number" ? "number" : "text"}
                  value={val !== undefined && val !== null ? String(val) : ""}
                  onChange={(e) => onChange(field.key, field.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
                  disabled={disabled}
                  className="h-8 text-sm"
                  placeholder={field.defaultValue !== undefined ? String(field.defaultValue) : undefined}
                  data-testid={`input-field-${field.key}`}
                />
              )
            )}

            {field.type === "textarea" && (
              <Textarea
                value={val !== undefined && val !== null ? String(val) : ""}
                onChange={(e) => onChange(field.key, e.target.value)}
                disabled={disabled}
                className={`text-sm min-h-[72px] ${field.uiComponent === "json_editor" || field.uiComponent === "code" ? "font-mono text-xs" : ""}`}
                placeholder={field.defaultValue !== undefined ? String(field.defaultValue) : undefined}
                data-testid={`textarea-field-${field.key}`}
              />
            )}

            {field.type === "boolean" && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`bool-${field.key}`}
                  checked={val === true || val === "true"}
                  onCheckedChange={(checked) => onChange(field.key, checked === true)}
                  disabled={disabled}
                  data-testid={`checkbox-field-${field.key}`}
                />
                <label htmlFor={`bool-${field.key}`} className="text-sm text-muted-foreground cursor-pointer">
                  {field.label}
                </label>
              </div>
            )}

            {field.type === "select" && (field.options || field.optionsSource) && (
              <Select
                value={val !== undefined && val !== null ? String(val) : ""}
                onValueChange={(v) => onChange(field.key, v)}
                disabled={disabled}
              >
                <SelectTrigger className="h-8 text-sm" data-testid={`select-field-${field.key}`}>
                  <SelectValue placeholder="Select an option…" />
                </SelectTrigger>
                <SelectContent>
                  {(field.options ?? []).map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                  {field.optionsSource && (field.options ?? []).length === 0 && (
                    <SelectItem value="_no_options_yet" disabled className="text-muted-foreground text-xs">
                      Options loaded from {field.optionsSource}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            )}

            {field.type === "multi_select" && field.options && (
              <div className="space-y-1" data-testid={`multi-select-field-${field.key}`}>
                {field.options.map((opt) => {
                  const selected = Array.isArray(val) ? (val as string[]).includes(opt) : false;
                  return (
                    <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={(chk) => {
                          const current = Array.isArray(val) ? [...(val as string[])] : [];
                          if (chk) {
                            onChange(field.key, [...current, opt]);
                          } else {
                            onChange(field.key, current.filter((v) => v !== opt));
                          }
                        }}
                        disabled={disabled}
                      />
                      <span>{opt}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {error && (
              <p className="text-xs text-red-500" data-testid={`error-field-${field.key}`}>{error}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
