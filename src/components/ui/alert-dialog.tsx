import * as React from 'react'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'

function classes(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ')
}

const AlertDialog = AlertDialogPrimitive.Root
const AlertDialogTrigger = AlertDialogPrimitive.Trigger
const AlertDialogPortal = AlertDialogPrimitive.Portal

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    ref={ref}
    className={classes('fixed inset-0 z-100 bg-[#2d1812]/65 backdrop-blur-[4px]', className)}
    {...props}
  />
))
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content> & {
    portalContainer?: HTMLElement | null
  }
>(({ className, portalContainer, ...props }, ref) => (
  <AlertDialogPortal container={portalContainer}>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={classes(
        'fixed left-1/2 top-1/2 z-101 grid w-[min(440px,calc(100%-32px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[18px_14px_20px_16px] border-2 border-[#3b2923] bg-[#fff5df] text-[#3b2923] shadow-[7px_7px_0_#3b2923] outline-none',
        className,
      )}
      {...props}
    />
  </AlertDialogPortal>
))
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName

function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={classes('border-b border-dashed border-[#d79c75] px-5 py-[18px] text-left', className)} {...props} />
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={classes('flex justify-end gap-2.5 border-t border-dashed border-[#d79c75] px-5 py-3.5', className)} {...props} />
}

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title ref={ref} className={classes('m-0 font-display text-[23px] font-bold leading-tight', className)} {...props} />
))
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description ref={ref} className={classes('m-0 px-5 py-5 text-[12px] leading-5 text-[#785d53]', className)} {...props} />
))
AlertDialogDescription.displayName = AlertDialogPrimitive.Description.displayName

const AlertDialogAction = AlertDialogPrimitive.Action
const AlertDialogCancel = AlertDialogPrimitive.Cancel

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}
