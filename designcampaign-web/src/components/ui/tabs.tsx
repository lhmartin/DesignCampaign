import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

const Tabs = TabsPrimitive.Root

const TabsList = ({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List
    className={cn(
      'flex h-9 items-center justify-start border-b border-[var(--color-border)] bg-[var(--color-background)] px-1 text-[var(--color-text-secondary)] w-full shrink-0',
      className
    )}
    {...props}
  />
)

const TabsTrigger = ({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-[var(--color-text-primary)] data-[state=active]:border-b-2 data-[state=active]:border-[var(--color-accent)] data-[state=active]:-mb-px hover:text-[var(--color-text-primary)]',
      className
    )}
    {...props}
  />
)

// TabsContent fills ALL available height in a flex-col parent.
// We override Radix's default display so flex sizing works reliably.
const TabsContent = ({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) => (
  <TabsPrimitive.Content
    className={cn(
      // When active, Radix removes [hidden] and we need this to stretch.
      // flex-1 + min-h-0 = fill remaining height without overflowing.
      'flex-1 min-h-0 overflow-hidden focus-visible:outline-none',
      className
    )}
    {...props}
  />
)

export { Tabs, TabsList, TabsTrigger, TabsContent }
