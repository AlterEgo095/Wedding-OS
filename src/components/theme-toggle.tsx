'use client'

import * as React from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'

/**
 * Mission 5.9.5 — Phase A
 * Accessible theme toggle. Touch-friendly (44px min via button base),
 * keyboard accessible, SSR-safe (renders a placeholder until mounted
 * to avoid hydration mismatch).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => setMounted(true), [])

  const isDark = mounted && theme === 'dark'

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={isDark ? 'Activer le thème clair' : 'Activer le thème sombre'}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            className={`touch-target relative overflow-hidden ${className ?? ''}`}
          >
            <Sun
              className={`h-5 w-5 transition-all duration-300 ${
                mounted && !isDark
                  ? 'rotate-0 scale-100 opacity-100'
                  : '-rotate-90 scale-0 opacity-0'
              }`}
              aria-hidden
            />
            <Moon
              className={`absolute h-5 w-5 transition-all duration-300 ${
                isDark
                  ? 'rotate-0 scale-100 opacity-100'
                  : 'rotate-90 scale-0 opacity-0'
              }`}
              aria-hidden
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-fluid-sm">
          {isDark ? 'Thème clair' : 'Thème sombre'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
