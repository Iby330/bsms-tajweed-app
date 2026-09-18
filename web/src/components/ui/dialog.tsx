"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  frameClassName,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  frameClassName?: string
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      {/* Two boxes, not one. The Popup is the frame: fixed, height-capped,
          and it never scrolls, so the close button pinned to it stays on
          screen however long the sheet gets. The scrolling happens one level
          in, on dialog-body, which also carries the padding.

          Where a consumer class lands follows one rule: `className` goes on
          the body, because nearly every call site passes spacing for the
          children (space-y-*); `frameClassName` goes on the Popup, for the
          size of the box itself (sm:max-w-md and the like). */}
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        // Below sm this is a bottom sheet, not a centred box: tall dialogs
        // (the hearing finish sheet, say) have to scroll rather than be
        // clipped by the viewport, and a centred dialog with a text field
        // ends up under the iOS keyboard. Every translate class is
        // sm:-prefixed on purpose: unprefixed, -translate-x-1/2 would shove
        // the full-width sheet half off the screen.
        className={cn(
          "fixed z-50 flex w-full flex-col bg-popover text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none inset-x-0 bottom-0 max-h-[calc(100dvh-3rem)] rounded-t-2xl data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-bottom-4 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-bottom-4 motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:max-h-[calc(100dvh-4rem)] sm:data-open:zoom-in-95 sm:data-open:slide-in-from-bottom-0 sm:data-closed:zoom-out-95 sm:data-closed:slide-out-to-bottom-0",
          frameClassName
        )}
        {...props}
      >
        <div
          data-slot="dialog-body"
          className={cn(
            "grid min-h-0 gap-4 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4",
            className
          )}
        >
          {children}
        </div>
        {showCloseButton && (
          // On the frame rather than the body, and above it, so it neither
          // scrolls away nor is painted over by the content passing under.
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2 z-10"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      // pr-10 keeps the title clear of the close button, which is 44px square
      // on a phone and sits 8px in from the frame's top right corner.
      className={cn("flex flex-col gap-2 pr-10", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        // The negative bottom margin has to cancel the body's own bottom
        // padding exactly, safe area included, or a strip of popover
        // background shows under the footer above a home indicator. A sheet
        // has no bottom corners to round either; the centred dialog does.
        "-mx-4 -mb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col-reverse gap-2 rounded-b-none border-t bg-muted/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:-mb-4 sm:flex-row sm:justify-end sm:rounded-b-xl sm:pb-4",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
