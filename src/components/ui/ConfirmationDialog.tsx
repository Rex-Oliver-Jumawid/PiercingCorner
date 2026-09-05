import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog'

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Go back',
  destructive = false,
  portalContainer,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  portalContainer?: HTMLElement | null
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  return <AlertDialog open={open} onOpenChange={onOpenChange}>
    <AlertDialogContent portalContainer={portalContainer}>
      <AlertDialogHeader>
        <p className="dashboard-eyebrow">PLEASE CONFIRM</p>
        <AlertDialogTitle>{title}</AlertDialogTitle>
      </AlertDialogHeader>
      <AlertDialogDescription>{description}</AlertDialogDescription>
      <AlertDialogFooter>
        <AlertDialogCancel className="dashboard-button">{cancelLabel}</AlertDialogCancel>
        <AlertDialogAction className={`dashboard-button ${destructive ? 'danger' : 'primary'}`} onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
}
