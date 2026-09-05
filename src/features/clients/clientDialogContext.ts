import { createContext } from 'react'

export const ClientDialogBusyContext = createContext<(busy: boolean) => void>(
  () => {},
)
