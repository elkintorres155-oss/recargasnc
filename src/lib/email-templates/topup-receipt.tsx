import React from 'react'
import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  orderCode?: string
  productName?: string
  packLabel?: string
  amountLabel?: string
  playerId?: string
  phone?: string
  date?: string
  imageUrl?: string
}

const ReceiptEmail = ({
  orderCode,
  productName,
  packLabel,
  amountLabel,
  playerId,
  phone,
  date,
  imageUrl,
}: Props) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>{`Tu recarga ${orderCode ?? ''} fue realizada correctamente — Recargas NC`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={logo}>Recargas NC</Heading>
          <Text style={headerSub}>Comprobante de recarga</Text>
        </Section>

        <Section style={content}>
          <Text style={h1}>¡Gracias por tu compra!</Text>
          <Text style={paragraph}>
            Tu recarga fue enviada correctamente. Aquí tienes el resumen de tu orden:
          </Text>

          {imageUrl && imageUrl.startsWith('http') ? (
            <Section style={{ textAlign: 'center' as const, margin: '16px 0' }}>
              <Img
                src={imageUrl}
                alt={productName || 'Producto'}
                width="120"
                height="120"
                style={{ borderRadius: '16px', margin: '0 auto' }}
              />
            </Section>
          ) : null}

          <Section style={invoiceBox}>
            <Row style={invoiceRow}>
              <Column style={labelCol}>Orden</Column>
              <Column style={valueCol}>{orderCode ?? '—'}</Column>
            </Row>
            <Row style={invoiceRow}>
              <Column style={labelCol}>Producto</Column>
              <Column style={valueCol}>{productName ?? '—'}</Column>
            </Row>
            {packLabel ? (
              <Row style={invoiceRow}>
                <Column style={labelCol}>Paquete</Column>
                <Column style={valueCol}>{packLabel}</Column>
              </Row>
            ) : null}
            {playerId ? (
              <Row style={invoiceRow}>
                <Column style={labelCol}>ID de jugador</Column>
                <Column style={valueCol}>{playerId}</Column>
              </Row>
            ) : null}
            {phone ? (
              <Row style={invoiceRow}>
                <Column style={labelCol}>Teléfono</Column>
                <Column style={valueCol}>{phone}</Column>
              </Row>
            ) : null}
            {date ? (
              <Row style={invoiceRow}>
                <Column style={labelCol}>Fecha</Column>
                <Column style={valueCol}>{date}</Column>
              </Row>
            ) : null}
            <Hr style={divider} />
            <Row>
              <Column style={totalLabel}>Total pagado</Column>
              <Column style={totalValue}>{amountLabel ?? '—'}</Column>
            </Row>
          </Section>

          <Text style={paragraph}>
            Si tienes algún problema con tu recarga, respóndenos con tu código de orden y te
            ayudamos de inmediato.
          </Text>
        </Section>

        <Section style={footer}>
          <Text style={footerText}>
            Recargas NC · Recargas de videojuegos en Nicaragua · Precios en córdobas (C$)
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ReceiptEmail,
  subject: (data: Record<string, any>) =>
    `Factura ${data['orderCode'] ?? ''} · Tu recarga está en camino`,
  displayName: 'Factura de recarga',
  previewData: {
    orderCode: 'RNC-ABC12345',
    productName: 'Free Fire',
    packLabel: '100 diamantes',
    amountLabel: 'C$65.00',
    playerId: '123456789',
    phone: '8888 8888',
    date: '26/8/2026, 1:15 a. m.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = {
  margin: '0 auto',
  maxWidth: '560px',
  border: '1px solid #e5e7eb',
  borderRadius: '16px',
  overflow: 'hidden' as const,
}
const header = {
  backgroundColor: '#0b1510',
  padding: '24px 25px',
  textAlign: 'center' as const,
}
const logo = {
  color: '#4ade80',
  fontSize: '26px',
  fontWeight: '800' as const,
  margin: '0',
  letterSpacing: '-0.5px',
}
const headerSub = { color: '#9ca3af', fontSize: '13px', margin: '4px 0 0' }
const content = { padding: '24px 25px' }
const h1 = { color: '#111827', fontSize: '20px', fontWeight: '700' as const, margin: '0 0 8px' }
const paragraph = { color: '#4b5563', fontSize: '14px', lineHeight: '22px', margin: '8px 0' }
const invoiceBox = {
  backgroundColor: '#f9fafb',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  padding: '16px 20px',
  margin: '16px 0',
}
const invoiceRow = { padding: '4px 0' }
const labelCol = { color: '#6b7280', fontSize: '13px', width: '45%' }
const valueCol = {
  color: '#111827',
  fontSize: '13px',
  fontWeight: '600' as const,
  textAlign: 'right' as const,
}
const divider = { borderColor: '#e5e7eb', margin: '10px 0' }
const totalLabel = { color: '#111827', fontSize: '15px', fontWeight: '700' as const, width: '45%' }
const totalValue = {
  color: '#16a34a',
  fontSize: '17px',
  fontWeight: '800' as const,
  textAlign: 'right' as const,
}
const footer = { padding: '16px 25px 24px' }
const footerText = {
  color: '#9ca3af',
  fontSize: '12px',
  lineHeight: '18px',
  textAlign: 'center' as const,
  margin: '0',
}
