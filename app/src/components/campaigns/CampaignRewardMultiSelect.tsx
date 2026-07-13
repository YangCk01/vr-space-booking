import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  filterRewardOptions,
  toggleRewardOption,
  type CampaignRewardSelectOption,
} from '@/domain/campaignRewardSelectOptions'

export default function CampaignRewardMultiSelect({
  label,
  options,
  value,
  onChange,
  placeholder,
}: {
  label: string
  options: CampaignRewardSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const filteredOptions = useMemo(() => filterRewardOptions(options, query), [options, query])
  const optionById = useMemo(() => new Map(options.map((option) => [option.value, option])), [options])

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={label}
            className="h-11 w-full justify-between border-vrborder-subtle bg-white px-3 font-normal text-vrtext-primary"
          >
            <span className={value.length ? '' : 'text-vrtext-tertiary'}>
              {value.length ? `已选择 ${value.length} 项` : placeholder}
            </span>
            <ChevronsUpDown className="size-4 text-vrtext-tertiary" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="z-[130] w-[var(--radix-popover-trigger-width)] p-0">
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder={`搜索${label}`} />
            <CommandList className="max-h-64">
              <CommandEmpty>没有匹配的{label}</CommandEmpty>
              {filteredOptions.map((option) => {
                const checked = value.includes(option.value)
                return (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => onChange(toggleRewardOption(value, option.value))}
                    className="gap-3 py-2.5"
                  >
                    <Checkbox checked={checked} tabIndex={-1} className="pointer-events-none" />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {checked && <Check className="size-4 text-vraccent-primary" />}
                  </CommandItem>
                )
              })}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((id) => {
            const option = optionById.get(id)
            if (!option) return null
            return (
              <span key={id} className="inline-flex max-w-full items-center gap-1 rounded-md bg-vraccent-primary/10 px-2.5 py-1 text-xs text-vraccent-primary">
                <span className="truncate">{option.label}</span>
                <button type="button" onClick={() => onChange(value.filter((item) => item !== id))} aria-label={`移除${option.label}`} className="rounded p-0.5 hover:bg-vraccent-primary/10">
                  <X className="size-3" />
                </button>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
