"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

/**
 * MISSION-5.9.0 Phase 0.8 — Sonner toaster upgrade
 * - richColors: success/error/warning/info variants get auto-colored backgrounds
 * - position: top-center (more visible than default bottom-right on mobile)
 * - toastOptions: 4s duration, design-token-driven classNames
 * - closeButton: dismiss affordance on every toast
 * - expand: false (hover to expand grouped toasts)
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      richColors
      closeButton
      expand={false}
      position="top-center"
      toastOptions={{
        duration: 4000,
        style: {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties,
        classNames: {
          success: "border-l-4 border-l-emerald-500",
          error: "border-l-4 border-l-destructive",
          warning: "border-l-4 border-l-amber-500",
          info: "border-l-4 border-l-primary",
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
