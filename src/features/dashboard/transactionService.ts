import { getSupabaseClient } from '../../lib/supabase/client'
import type { Database, Json } from '../../types/database'
import { parseTransactionItems } from './transactionModel'
import type {
  CatalogKind,
  CatalogOption,
  ClientOption,
  DashboardTransaction,
  NewClientDraft,
  PaymentDraft,
  AcceptedWaiverSigning,
  TransactionStatus,
  TransactionWaiver,
  WaiverPreparation,
  StudioResourceOption,
} from './transactionModel'

export async function listTransactions(search: string, signal: AbortSignal) {
  const { data, error } = await getSupabaseClient()
    .rpc('search_dashboard_transactions', { search_text: search })
    .abortSignal(signal)
  if (error) throw new Error('Unable to load today’s transactions. Please try again.')
  return (data ?? []).map((row): DashboardTransaction => ({
    ...row,
    items: parseTransactionItems(row.items),
  }))
}

export async function searchClients(search: string, signal: AbortSignal) {
  const { data, error } = await getSupabaseClient()
    .rpc('search_clients', { search_text: search })
    .order('full_name')
    .order('id')
    .limit(6)
    .abortSignal(signal)
  if (error) throw new Error('Unable to search clients. Please try again.')
  return (data ?? []).flatMap((row): ClientOption[] =>
    row.id && row.full_name
      ? [{ id: row.id, full_name: row.full_name, email: row.email, phone: row.phone }]
      : [],
  )
}

export async function listActiveCatalog(
  kind: CatalogKind,
  signal: AbortSignal,
): Promise<CatalogOption[]> {
  const table = kind === 'service' ? 'services' : 'products'
  const { data, error } = await getSupabaseClient()
    .from(table)
    .select('id, name, price, active')
    .eq('active', true)
    .order('name')
    .order('id')
    .abortSignal(signal)
  if (error) throw new Error(`Unable to load ${kind}s. Please try again.`)
  return data ?? []
}

export async function listAssignablePiercers(serviceIds: string[], signal: AbortSignal): Promise<StudioResourceOption[]> {
  const { data, error } = await getSupabaseClient()
    .rpc('get_assignable_piercers', { selected_service_ids: serviceIds })
    .abortSignal(signal)
  if (error) throw new Error('Unable to load currently assignable piercers. Please try again.')
  return data ?? []
}

export async function listActiveStations(signal: AbortSignal): Promise<StudioResourceOption[]> {
  const { data, error } = await getSupabaseClient()
    .from('stations')
    .select('id, name')
    .eq('active', true)
    .order('name')
    .order('id')
    .abortSignal(signal)
  if (error) throw new Error('Unable to load stations. Please try again.')
  return data ?? []
}

export async function updateTransactionStatus(
  id: string,
  status: Exclude<TransactionStatus, 'completed'>,
) {
  const { data, error } = await getSupabaseClient()
    .from('transactions')
    .update({ status })
    .eq('id', id)
    .in('status', ['pending', 'ongoing'])
    .select('id')
    .maybeSingle()
  if (error || !data) throw new Error('Could not update this transaction. Refresh and try again.')
  return data
}

export async function recordProductSale(input: {
  existingClient: ClientOption | null
  newClient: NewClientDraft
  productIds: string[]
  payment: PaymentDraft
}) {
  const clientDetails: Json = input.existingClient
    ? { existing_client_id: input.existingClient.id }
    : {
        full_name: `${input.newClient.first_name.trim()} ${input.newClient.last_name.trim()}`,
        email: input.newClient.email.trim() || null,
        phone: input.newClient.phone.trim() || null,
      }
  const { data, error } = await getSupabaseClient().rpc('record_product_sale', {
    client_details: clientDetails,
    selected_product_ids: input.productIds,
    selected_payment_method: input.payment.method,
    payment_reference: input.payment.reference.trim(),
  })
  if (error || !data?.[0]) {
    throw new Error('Could not complete this sale. Your draft has been kept; please try again.')
  }
  return data[0]
}

export async function finalizeTransaction(input: {
  transactionId: string
  serviceIds: string[]
  productIds: string[]
  payment: PaymentDraft
}) {
  const { data, error } = await getSupabaseClient().rpc('finalize_transaction', {
    target_transaction_id: input.transactionId,
    selected_service_ids: input.serviceIds,
    selected_product_ids: input.productIds,
    selected_payment_method: input.payment.method,
    payment_reference: input.payment.reference.trim(),
  })
  if (error || !data?.[0]) {
    throw new Error('Could not finalize this transaction. Review it and try again.')
  }
  return data[0]
}

function clientDetails(
  existingClient: ClientOption | null,
  newClient: NewClientDraft,
  assignment?: { piercerId: string; stationId: string },
): Json {
  const client = existingClient
    ? { existing_client_id: existingClient.id }
    : {
        full_name: `${newClient.first_name.trim()} ${newClient.last_name.trim()}`,
        email: newClient.email.trim() || null,
        phone: newClient.phone.trim() || null,
      }
  return assignment ? { ...client, piercer_profile_id: assignment.piercerId, station_id: assignment.stationId } : client
}

export async function prepareWaiverSigning(
  transactionId?: string,
): Promise<WaiverPreparation> {
  const { data, error } = await getSupabaseClient().rpc('prepare_waiver_signing', {
    target_transaction_id: transactionId,
  })
  if (error || !data?.[0]) {
    throw new Error('Could not prepare the waiver. Refresh and try again.')
  }
  return data[0]
}

export async function acceptNewServiceWaiver(input: {
  eventId: string
  existingClient: ClientOption | null
  newClient: NewClientDraft
  serviceIds: string[]
  productIds: string[]
  piercerId: string
  stationId: string
}): Promise<AcceptedWaiverSigning> {
  const { data, error } = await getSupabaseClient().rpc('accept_new_service_waiver', {
    signing_event_id: input.eventId,
    client_details: clientDetails(input.existingClient, input.newClient, { piercerId: input.piercerId, stationId: input.stationId }),
    selected_service_ids: input.serviceIds,
    selected_product_ids: input.productIds,
  })
  if (error || !data?.[0]) {
    const expired = error?.message.toLocaleLowerCase('en-PH').includes('expired')
    const unavailable = error?.message.toLocaleLowerCase('en-PH').includes('not qualified and available')
    throw new Error(expired
      ? 'This waiver session expired. Reload the current terms and ask the client to sign again.'
      : unavailable
        ? 'The selected piercer is no longer qualified or available within the current Studio schedule.'
        : 'Could not establish the signed transaction. Your draft has been kept.')
  }
  return data[0]
}

export async function acceptExistingTransactionWaiver(
  eventId: string,
): Promise<AcceptedWaiverSigning> {
  const { data, error } = await getSupabaseClient().rpc('accept_existing_transaction_waiver', {
    signing_event_id: eventId,
  })
  if (error || !data?.[0]) {
    throw new Error('Could not establish the signing event. Reload the waiver and try again.')
  }
  return data[0]
}

export function waiverPaths(transactionId: string, eventId: string) {
  const prefix = `transactions/${transactionId}/waivers/${eventId}`
  return { signature: `${prefix}/signature.png`, pdf: `${prefix}/waiver.pdf` }
}

export async function uploadWaiverDocuments(input: {
  transactionId: string
  eventId: string
  signature: Blob
  pdf: Blob
}) {
  const paths = waiverPaths(input.transactionId, input.eventId)
  const storage = getSupabaseClient().storage.from('waiver-documents')
  const signatureUpload = await storage.upload(paths.signature, input.signature, {
    contentType: 'image/png',
    upsert: false,
  })
  if (signatureUpload.error && !/already exists|duplicate/i.test(signatureUpload.error.message)) {
    throw new Error('Could not upload the signature. The Pending transaction can be resumed.')
  }
  const pdfUpload = await storage.upload(paths.pdf, input.pdf, {
    contentType: 'application/pdf',
    upsert: false,
  })
  if (pdfUpload.error && !/already exists|duplicate/i.test(pdfUpload.error.message)) {
    throw new Error('Could not upload the waiver PDF. The Pending transaction can be resumed.')
  }
  return paths
}

export async function finalizeSignedWaiver(input: {
  eventId: string
  signaturePath: string
  pdfPath: string
}) {
  const { data, error } = await getSupabaseClient().rpc('finalize_signed_waiver', {
    signing_event_id: input.eventId,
    signature_storage_path: input.signaturePath,
    pdf_storage_path: input.pdfPath,
  })
  if (error || !data?.[0]) {
    throw new Error('Could not finalize the waiver. The Pending transaction can be resumed.')
  }
  return data[0]
}

export async function abandonWaiverSigning(eventId: string) {
  await getSupabaseClient().rpc('abandon_waiver_signing', { signing_event_id: eventId })
}

export async function getTransactionWaiver(
  transactionId: string,
  signal?: AbortSignal,
): Promise<TransactionWaiver | null> {
  let query = getSupabaseClient()
    .rpc('get_transaction_waiver', { target_transaction_id: transactionId })
  if (signal) query = query.abortSignal(signal)
  const singleQuery = query.maybeSingle()
  const { data, error } = await singleQuery
  if (error) throw new Error('Could not load this transaction’s waiver.')
  return data
}

export async function getRecoverableWaiverSigning(
  transactionId: string,
): Promise<AcceptedWaiverSigning | null> {
  const { data, error } = await getSupabaseClient()
    .rpc('get_recoverable_waiver_signing', { target_transaction_id: transactionId })
    .maybeSingle()
  if (error) throw new Error('Could not check the waiver recovery state.')
  return data
}

export async function downloadSignaturePng(transactionId: string, eventId: string) {
  const path = waiverPaths(transactionId, eventId).signature
  const { data, error } = await getSupabaseClient().storage
    .from('waiver-documents')
    .download(path)
  return error ? null : data
}

export async function downloadWaiverPdf(path: string) {
  const { data, error } = await getSupabaseClient().storage
    .from('waiver-documents')
    .download(path)
  if (error) throw new Error('Could not download the waiver PDF.')
  return data
}

export type PaymentMethod = Database['public']['Enums']['payment_method']
