import { useIndustry } from "./industry-provider";
import { useLayoutEffect, type ComponentProps } from "react";
import { Select, SelectItem } from "@/components/ui/select";
import { demoIndustryFormValue, demoIndustryOptionValues, type DemoIndustryOptions } from "@shared/demo-industry-visibility";

export function IndustrySelect({ value, onValueChange, includeAll, general, excludeCrossIndustry, ...props }: ComponentProps<typeof Select> & DemoIndustryOptions) {
  const { allIndustries, industry, demoVisibilityState } = useIndustry();
  const next = demoVisibilityState === "ready" ? demoIndustryFormValue(value ?? "", allIndustries.map(i => i.id), industry?.id ?? null, { includeAll, general, excludeCrossIndustry }) : null;
  useLayoutEffect(() => {
    if (next !== null && next !== value) onValueChange?.(next);
  }, [next, value, onValueChange]);
  return <Select {...props} value={next ?? value} onValueChange={onValueChange} />;
}

/** All industry option lists consume the same per-user presentation setting. */
export function IndustrySelectItems(options: DemoIndustryOptions) {
  const { allIndustries } = useIndustry();
  return <>
    {demoIndustryOptionValues(allIndustries.map(i => i.id), options).map(value =>
      <SelectItem key={value} value={value} data-testid={`option-industry-${value}`}>{value === "all" ? "All visible industries" : value === "general" ? "General" : allIndustries.find(i => i.id === (value === "cross_industry" ? "custom" : value))?.label}</SelectItem>)}
  </>;
}
