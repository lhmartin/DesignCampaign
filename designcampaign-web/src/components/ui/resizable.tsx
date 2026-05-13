import { GripVertical } from 'lucide-react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { cn } from '@/lib/utils'
import type React from 'react'

const ResizablePanelGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof Group>) => (
  <Group
    className={cn(
      'flex h-full w-full data-[panel-group-orientation=vertical]:flex-col',
      className
    )}
    {...props}
  />
)

const ResizablePanel = Panel

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & { withHandle?: boolean }) => (
  <Separator
    className={cn(
      // 8px wide hit area — wide enough to grab reliably
      'group relative flex w-2 shrink-0 items-center justify-center',
      'bg-transparent cursor-col-resize',
      // Vertical variant
      'data-[panel-group-direction=vertical]:h-2 data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:cursor-row-resize',
      // Keyboard focus ring
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-accent)]',
      className
    )}
    {...props}
  >
    {/* Always-visible divider line: 1px centered in the 8px hit area. */}
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute bg-[var(--color-border)]',
        // Horizontal handle → vertical 1px line; vertical handle → horizontal 1px line.
        'left-1/2 top-0 h-full w-px -translate-x-1/2',
        'group-data-[panel-group-direction=vertical]:left-0 group-data-[panel-group-direction=vertical]:top-1/2 group-data-[panel-group-direction=vertical]:h-px group-data-[panel-group-direction=vertical]:w-full group-data-[panel-group-direction=vertical]:-translate-y-1/2 group-data-[panel-group-direction=vertical]:translate-x-0',
      )}
    />
    {withHandle && (
      <div
        className="absolute z-10 flex h-5 w-4 items-center justify-center rounded-sm border border-[var(--color-border)] bg-[var(--color-secondary-bg)]"
        style={{ left: '50%', transform: 'translateX(-50%)' }}
      >
        <GripVertical className="h-3 w-3 text-[var(--color-text-secondary)]" />
      </div>
    )}
  </Separator>
)

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
