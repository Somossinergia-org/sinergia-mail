# Schema Unificado — Sinergia + CRM Energía (Fase 1)

> Última actualización: 2026-04-21  
> Migración: `drizzle/0002_crm_unification.sql`  
> ORM: Drizzle 0.33 · PostgreSQL

---

## Resumen del modelo de datos

Fase 1 unifica Sinergia (email + agentes) con CRM Energía bajo un **modelo centrado en empresa** (company-centric). Se añaden 6 tablas nuevas y se extienden 4 existentes sin romper nada previo.

### Tablas nuevas (6)

| Tabla | Propósito | FK principal |
|-------|-----------|-------------|
| `companies` | Entidad central CRM | `users.id` (owner) |
| `supply_points` | Suministros energéticos (CUPS) | `companies.id` |
| `opportunities` | Pipeline de ventas (10 estados) | `companies.id`, `users.id` |
| `services` | Servicios ofertados/contratados (8 tipos) | `companies.id`, `opportunities.id` |
| `documents` | Documentos vinculados a empresa | `companies.id` |
| `energy_bills` | Facturas energéticas parseadas | `supply_points.id` |

### Tablas modificadas (4)

| Tabla | Columnas añadidas |
|-------|-------------------|
| `users` | `role`, `phone`, `firma` |
| `contacts` | `company_id` |
| `cases` | `company_id`, `opportunity_id` |
| `visits` | `company_id`, `contact_id` |

---

## Detalle de tablas nuevas

### companies

Entidad central. Cada empresa pertenece a un usuario (comercial).

| Columna | Tipo | Nullable | Default | Notas |
|---------|------|----------|---------|-------|
| `id` | serial | PK | auto | |
| `user_id` | text | NOT NULL | — | FK → users.id (CASCADE) |
| `name` | text | NOT NULL | — | Nombre comercial |
| `legal_name` | text | sí | — | Razón social |
| `nif` | varchar(20) | sí | — | CIF/NIF |
| `sector` | varchar(50) | sí | — | |
| `cnae` | varchar(10) | sí | — | Código CNAE |
| `address` | text | sí | — | |
| `city` | text | sí | — | |
| `province` | varchar(50) | sí | — | |
| `postal_code` | varchar(10) | sí | — | |
| `lat` | real | sí | — | Latitud |
| `lng` | real | sí | — | Longitud |
| `phone` | text | sí | — | |
| `email` | text | sí | — | |
| `website` | text | sí | — | |
| `instagram` | text | sí | — | |
| `facebook` | text | sí | — | |
| `source` | varchar(30) | sí | — | manual, csv_import, google_places, referido, email_auto |
| `tags` | text[] | sí | — | |
| `notes` | text | sí | — | |
| `zone_id` | integer | sí | — | Reservado para futuro FK → zones |
| `created_by` | text | sí | — | FK → users.id (SET NULL) |
| `created_at` | timestamp | sí | now() | |
| `updated_at` | timestamp | sí | now() | |

**Índices:** `user_id`, `nif`, `province`, `source`

---

### supply_points

Puntos de suministro energético con código CUPS.

| Columna | Tipo | Nullable | Default | Notas |
|---------|------|----------|---------|-------|
| `id` | serial | PK | auto | |
| `company_id` | integer | NOT NULL | — | FK → companies.id (CASCADE) |
| `cups` | varchar(25) | UNIQUE | — | Código Unificado de Punto de Suministro |
| `address` | text | sí | — | |
| `tariff` | varchar(10) | sí | — | 2.0TD, 3.0TD, 6.1TD |
| `power_p1_kw` … `power_p6_kw` | real | sí | — | Potencias contratadas P1-P6 |
| `annual_consumption_kwh` | real | sí | — | |
| `monthly_spend_eur` | real | sí | — | |
| `current_retailer` | varchar(100) | sí | — | Comercializadora actual |
| `distributor` | varchar(100) | sí | — | |
| `contract_expiry_date` | timestamp | sí | — | |
| `estimated_savings_eur` | real | sí | — | |
| `estimated_savings_pct` | real | sí | — | |
| `status` | varchar(20) | sí | 'active' | active, inactive, pending |
| `notes` | text | sí | — | |
| `created_at` | timestamp | sí | now() | |
| `updated_at` | timestamp | sí | now() | |

**Índices:** `company_id`, `cups`, `current_retailer`, `contract_expiry_date`

---

### opportunities

Pipeline de ventas con 10 estados progresivos.

| Columna | Tipo | Nullable | Default | Notas |
|---------|------|----------|---------|-------|
| `id` | serial | PK | auto | |
| `user_id` | text | NOT NULL | — | FK → users.id (CASCADE) |
| `company_id` | integer | NOT NULL | — | FK → companies.id (CASCADE) |
| `primary_contact_id` | integer | sí | — | FK → contacts.id (SET NULL) |
| `title` | text | NOT NULL | — | |
| `description` | text | sí | — | |
| `status` | varchar(30) | NOT NULL | 'pendiente' | Ver estados abajo |
| `temperature` | varchar(10) | sí | — | frio, tibio, caliente |
| `priority` | varchar(10) | sí | — | alta, media, baja |
| `estimated_value_eur` | real | sí | — | |
| `expected_close_date` | timestamp | sí | — | |
| `lost_reason` | text | sí | — | Solo si status = perdido |
| `source` | varchar(30) | sí | — | manual, email, whatsapp, web, referido |
| `tags` | text[] | sí | — | |
| `notes` | text | sí | — | |
| `created_at` | timestamp | sí | now() | |
| `updated_at` | timestamp | sí | now() | |
| `closed_at` | timestamp | sí | — | Auto-set en estados terminales |

**Pipeline (10 estados):**
```
pendiente → contactado → interesado → visita_programada → visitado →
oferta_enviada → negociacion → contrato_firmado → cliente_activo → perdido
```

**Índices:** `user_id`, `company_id`, `status`, `temperature`, `priority`, `expected_close_date`

---

### services

Servicios ofertados o contratados. Multiproducto (8 tipos Sinergia).

| Columna | Tipo | Nullable | Default | Notas |
|---------|------|----------|---------|-------|
| `id` | serial | PK | auto | |
| `company_id` | integer | NOT NULL | — | FK → companies.id (CASCADE) |
| `opportunity_id` | integer | sí | — | FK → opportunities.id (SET NULL) |
| `supply_point_id` | integer | sí | — | FK → supply_points.id (SET NULL) |
| `type` | varchar(30) | NOT NULL | — | Ver tipos abajo |
| `status` | varchar(20) | sí | 'prospecting' | prospecting, offered, contracted, cancelled |
| `current_provider` | text | sí | — | |
| `current_spend_eur` | real | sí | — | |
| `offered_price_eur` | real | sí | — | |
| `estimated_savings` | real | sí | — | |
| `contract_date` | timestamp | sí | — | |
| `expiry_date` | timestamp | sí | — | |
| `data` | jsonb | sí | — | Extensiones específicas por tipo |
| `notes` | text | sí | — | |
| `created_at` | timestamp | sí | now() | |
| `updated_at` | timestamp | sí | now() | |

**8 tipos de servicio Sinergia:**
`energia`, `telecomunicaciones`, `alarmas`, `seguros`, `agentes_ia`, `web`, `crm`, `aplicaciones`

**4 estados de servicio:**
`prospecting` → `offered` → `contracted` | `cancelled`

**Índices:** `company_id`, `opportunity_id`, `type`, `status`

---

### documents

Documentos vinculados a empresa u oportunidad.

| Columna | Tipo | Nullable | Default | Notas |
|---------|------|----------|---------|-------|
| `id` | serial | PK | auto | |
| `company_id` | integer | NOT NULL | — | FK → companies.id (CASCADE) |
| `opportunity_id` | integer | sí | — | FK → opportunities.id (SET NULL) |
| `uploaded_by` | text | sí | — | FK → users.id (SET NULL) |
| `name` | text | NOT NULL | — | |
| `type` | varchar(30) | sí | — | contrato, factura, oferta, propuesta, dni, otro |
| `file_url` | text | NOT NULL | — | |
| `file_name` | text | sí | — | |
| `file_size` | integer | sí | — | |
| `file_mime` | varchar(100) | sí | — | |
| `notes` | text | sí | — | |
| `created_at` | timestamp | sí | now() | |
| `updated_at` | timestamp | sí | now() | |

**Índices:** `company_id`, `opportunity_id`, `type`

---

### energy_bills

Facturas energéticas parseadas (bill parser). Vinculadas a supply point.

| Columna | Tipo | Nullable | Default | Notas |
|---------|------|----------|---------|-------|
| `id` | serial | PK | auto | |
| `supply_point_id` | integer | NOT NULL | — | FK → supply_points.id (CASCADE) |
| `document_id` | integer | sí | — | FK → documents.id (SET NULL) |
| `billing_period_start` | timestamp | sí | — | |
| `billing_period_end` | timestamp | sí | — | |
| `retailer` | varchar(100) | sí | — | |
| `total_amount_eur` | real | sí | — | |
| `energy_amount_eur` | real | sí | — | |
| `power_amount_eur` | real | sí | — | |
| `tax_amount_eur` | real | sí | — | |
| `electricity_tax_eur` | real | sí | — | |
| `meter_rental_eur` | real | sí | — | |
| `reactive_eur` | real | sí | — | |
| `consumption_kwh` | jsonb | sí | — | {P1: x, P2: y, ...} |
| `power_kw` | jsonb | sí | — | |
| `prices_eur_kwh` | jsonb | sí | — | |
| `confidence_score` | real | sí | — | 0-100 |
| `raw_extraction` | jsonb | sí | — | Datos crudos del parser |
| `parsed_at` | timestamp | sí | — | |
| `created_at` | timestamp | sí | now() | |

**Índices:** `supply_point_id`, `retailer`, `billing_period_end`

---

## Columnas añadidas a tablas existentes

### users (3 columnas nuevas)

| Columna | Tipo | Default | Notas |
|---------|------|---------|-------|
| `role` | varchar(20) | 'admin' | admin, supervisor, comercial |
| `phone` | text | NULL | |
| `firma` | text | NULL | HTML de firma de email |

### contacts (1 columna nueva)

| Columna | Tipo | Default | FK |
|---------|------|---------|-----|
| `company_id` | integer | NULL | → companies.id (SET NULL) |

### cases (2 columnas nuevas)

| Columna | Tipo | Default | FK |
|---------|------|---------|-----|
| `company_id` | integer | NULL | → companies.id (SET NULL) |
| `opportunity_id` | integer | NULL | → opportunities.id (SET NULL) |

### visits (2 columnas nuevas)

| Columna | Tipo | Default | FK |
|---------|------|---------|-----|
| `company_id` | integer | NULL | → companies.id (SET NULL) |
| `contact_id` | integer | NULL | → contacts.id (SET NULL) |

---

## Diagrama de relaciones (simplificado)

```
users ──┬──< companies ──┬──< supply_points ──< energy_bills
        │                 ├──< opportunities ──< services
        │                 ├──< documents
        │                 └──< services
        ├──< contacts ────────> companies (company_id FK)
        ├──< cases ────────────> companies + opportunities
        └──< visits ───────────> companies + contacts
```

---

## Roles de usuario

| Rol | Nivel | Permisos |
|-----|-------|----------|
| `admin` | 3 (máximo) | Todo |
| `supervisor` | 2 | Supervisión + comercial |
| `comercial` | 1 | CRUD propio |

Jerarquía: `hasMinRole(userRole, requiredRole)` verifica que el nivel del usuario sea >= al requerido.

Default para usuarios existentes: `'admin'` (no rompe nada).

---

## Reglas de idempotencia

La migración SQL usa `IF NOT EXISTS` en todos los CREATE TABLE y ADD COLUMN. No contiene DROP ni RENAME. Todas las columnas nuevas en tablas existentes son nullable o tienen default.

---

## Archivos de referencia

| Archivo | Contenido |
|---------|-----------|
| `src/db/schema.ts` | Definición Drizzle completa |
| `drizzle/0002_crm_unification.sql` | Migración SQL formal |
| `src/lib/auth/roles.ts` | Helper de roles |
| `src/lib/crm/types.ts` | Enums y constantes |
| `src/lib/crm/companies.ts` | Service CRUD empresas |
| `src/lib/crm/opportunities.ts` | Service CRUD oportunidades |
| `src/lib/crm/services.ts` | Service CRUD servicios |
| `src/lib/crm/supply-points.ts` | Service CRUD puntos de suministro |
| `src/lib/crm/contacts.ts` | Service vinculación contacto-empresa |
| `src/app/api/crm/companies/` | API routes empresas |
| `src/app/api/crm/opportunities/` | API routes oportunidades |
