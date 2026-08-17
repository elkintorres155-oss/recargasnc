export type OrderStatus =
  | 'pending_payment'
  | 'receipt_review'
  | 'payment_rejected'
  | 'payment_approved'
  | 'provider_processing'
  | 'completed'
  | 'failed'
  | 'refunded';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: 'Esperando pago',
  receipt_review: 'Comprobante en revisión',
  payment_rejected: 'Pago rechazado',
  payment_approved: 'Pago aprobado',
  provider_processing: 'Recarga en proceso',
  completed: 'Completada',
  failed: 'Fallida',
  refunded: 'Reembolsada',
};

export const STATUS_TONE: Record<OrderStatus, string> = {
  pending_payment: 'bg-secondary text-muted-foreground',
  receipt_review: 'bg-secondary text-foreground',
  payment_rejected: 'bg-destructive/15 text-destructive',
  payment_approved: 'bg-primary/15 text-primary',
  provider_processing: 'bg-primary/15 text-primary',
  completed: 'bg-primary/20 text-primary',
  failed: 'bg-destructive/15 text-destructive',
  refunded: 'bg-secondary text-muted-foreground',
};
