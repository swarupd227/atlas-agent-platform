import { useState, useRef, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { OntologyConcept } from "@shared/schema";

interface OntologyAutocompleteProps {
  value: string;
  onChange: (val: string) => void;
  industry: string;
  placeholder?: string;
  className?: string;
  testId?: string;
  multiline?: boolean;
  rows?: number;
}

export function OntologyAutocomplete({
  value,
  onChange,
  industry,
  placeholder,
  className,
  testId,
  multiline,
  rows,
}: OntologyAutocompleteProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const [suggestions, setSuggestions] = useState<OntologyConcept[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getTokenAtCursor = (text: string, pos: number) => {
    const before = text.slice(0, pos);
    const match = before.match(/[\w_]+$/);
    return match ? match[0] : "";
  };

  const fetchSuggestions = useCallback(
    (prefix: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!industry || prefix.length < 2) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const res = await fetch(
            `/api/ontology/terms?industry=${encodeURIComponent(industry)}&prefix=${encodeURIComponent(prefix)}`
          );
          if (res.ok) {
            const data: OntologyConcept[] = await res.json();
            setSuggestions(data.slice(0, 8));
            setShowSuggestions(data.length > 0);
          } else {
            setSuggestions([]);
            setShowSuggestions(false);
          }
        } catch {
          setSuggestions([]);
          setShowSuggestions(false);
        } finally {
          setLoading(false);
        }
      }, 300);
    },
    [industry]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleInputChange = (newVal: string, newPos: number) => {
    onChange(newVal);
    setCursorPos(newPos);
    const token = getTokenAtCursor(newVal, newPos);
    if (token.length >= 2) {
      fetchSuggestions(token);
    } else {
      setShowSuggestions(false);
    }
  };

  const insertConcept = (concept: OntologyConcept) => {
    const token = getTokenAtCursor(value, cursorPos);
    const before = value.slice(0, cursorPos - token.length);
    const after = value.slice(cursorPos);
    const label = concept.label.replace(/\s+/g, "_").toUpperCase();
    const newVal = before + label + after;
    onChange(newVal);
    setShowSuggestions(false);
    setSuggestions([]);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const sharedProps = {
    value,
    placeholder,
    className: className || "",
    "data-testid": testId,
    onBlur: () => setTimeout(() => setShowSuggestions(false), 200),
  };

  return (
    <div className="relative">
      {multiline ? (
        <Textarea
          ref={inputRef as any}
          {...sharedProps}
          rows={rows}
          onChange={(e) =>
            handleInputChange(e.target.value, e.target.selectionStart || 0)
          }
          onKeyUp={(e) =>
            setCursorPos(
              (e.target as HTMLTextAreaElement).selectionStart || 0
            )
          }
          onClick={(e) =>
            setCursorPos(
              (e.target as HTMLTextAreaElement).selectionStart || 0
            )
          }
        />
      ) : (
        <Input
          ref={inputRef as any}
          {...sharedProps}
          onChange={(e) =>
            handleInputChange(e.target.value, e.target.selectionStart || 0)
          }
          onKeyUp={(e) =>
            setCursorPos(
              (e.target as HTMLInputElement).selectionStart || 0
            )
          }
          onClick={(e) =>
            setCursorPos(
              (e.target as HTMLInputElement).selectionStart || 0
            )
          }
        />
      )}
      {showSuggestions && suggestions.length > 0 && (
        <div
          className="absolute z-50 left-0 right-0 top-full mt-1 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto"
          data-testid="ontology-suggestions"
        >
          {suggestions.map((concept) => (
            <div
              key={concept.id}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover-elevate text-sm"
              onMouseDown={(e) => {
                e.preventDefault();
                insertConcept(concept);
              }}
              data-testid={`suggestion-${concept.id}`}
            >
              <span className="font-mono text-xs text-purple-600 dark:text-purple-400 shrink-0">
                {concept.label.replace(/\s+/g, "_").toUpperCase()}
              </span>
              <span className="text-muted-foreground text-[11px] truncate">
                {concept.category}
              </span>
            </div>
          ))}
          <div className="px-3 py-1.5 border-t text-[10px] text-muted-foreground">
            {loading
              ? "Searching ontology..."
              : "Type to search ontology vocabulary"}
          </div>
        </div>
      )}
    </div>
  );
}
