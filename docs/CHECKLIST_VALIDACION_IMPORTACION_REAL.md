# Checklist de Validación — Importación Real con Datos

## Preparación previa

Antes de testear con datos reales:

1. Migración ejecutada: `drizzle/0008_import_client_type.sql`
2. Deploy desplegado con el módulo de importación
3. Sesión activa en la app (login)
4. Navegar a **Dashboard → Ajustes → Importar**

---

## TEST 1: Empresas (archivo mínimo)

### Archivo de prueba: `test_empresas.csv`

```csv
Nombre;NIF;Teléfono;Email;Dirección;Ciudad;CP;Sector;Tipo cliente;Etiquetas;Notas
Panadería López;12345678Z;966112233;panaderia@test.com;Calle Mayor 5;Orihuela;03300;Alimentación;particular;pan,horeca;Cliente frecuente
Energía Sur SL;B12345678;965887744;info@energiasur.com;Polígono Industrial 12;Alicante;03007;Energía;empresa;energía,industrial;Proveedor potencial
Juan García Autónomo;44556677R;600112233;juan@autonomo.com;;;03001;;autonomo;autónomo;
```

### Pasos

1. Seleccionar entidad: **Empresas**
2. Subir `test_empresas.csv`
3. Marcar **Modo simulación**
4. Pulsar **Simular importación**

### Verificar en resultado de simulación

- [ ] `totalRows: 3`
- [ ] `inserted: 3` (no hay empresas previas)
- [ ] `errors: 0`
- [ ] Header mapping muestra: `Nombre → name`, `NIF → nif`, `Teléfono → phone`, `Email → email`, etc.
- [ ] Unmapped headers: vacío (todos reconocidos)

5. Desmarcar **Modo simulación**
6. Pulsar **Importar**

### Verificar en resultado real

- [ ] `inserted: 3`
- [ ] `errors: 0`
- [ ] Cada fila tiene `entityId` (número > 0)

### Verificar en el CRM

- [ ] Ir a **CRM → Empresas** y buscar "Panadería López"
- [ ] Verificar que el NIF aparece como `12345678Z` (sin espacios)
- [ ] Verificar que el teléfono aparece como `+34966112233`
- [ ] Verificar que el CP es `03300`
- [ ] Verificar que `clientType` es `particular`
- [ ] Verificar que las etiquetas son `["pan", "horeca"]`
- [ ] Verificar "Energía Sur SL" con `clientType = empresa`
- [ ] Verificar "Juan García Autónomo" con `clientType = autonomo`

---

## TEST 2: Deduplicación de empresas (reimportar)

### Archivo: el mismo `test_empresas.csv` pero con cambios

```csv
Nombre;NIF;Teléfono;Email;Dirección;Ciudad;CP;Sector;Tipo cliente;Etiquetas;Notas
Panadería López;12345678Z;966112233;panaderia@test.com;Calle Mayor 5;Orihuela;03300;Alimentación;particular;premium;Nuevo comentario
```

### Pasos

1. Importar con dry run primero
2. Verificar: `updated: 1` (no inserted, porque ya existe por NIF)
3. Importar real

### Verificar en el CRM

- [ ] Sigue habiendo UNA sola "Panadería López" (no duplicada)
- [ ] Tags ahora son `["pan", "horeca", "premium"]` (merge, no reemplazo)
- [ ] Notas contienen "Cliente frecuente" + separador `---` + "Nuevo comentario"
- [ ] Source sigue siendo el original (no sobreescrito)

---

## TEST 3: Contactos con vinculación a empresa

### Archivo: `test_contactos.csv`

```csv
Nombre;Email;Teléfono;Empresa;Ciudad;CP;Categoría;Notas
María López;maria@panaderia.com;600223344;12345678Z;Orihuela;03300;A;Gerente de la panadería
Pedro Martín;pedro@energiasur.com;655443322;Energía Sur SL;Alicante;03007;B;Comercial zona Levante
Ana Sin Empresa;ana@libre.com;666778899;;Madrid;28001;C;Contacto independiente
```

### Pasos

1. Simular primero (dry run)
2. Verificar: `inserted: 3`, `errors: 0`
3. Importar real

### Verificar vinculación a empresa

- [ ] María López → `companyId` apunta a "Panadería López" (buscada por NIF `12345678Z`)
- [ ] Pedro Martín → `companyId` apunta a "Energía Sur SL" (buscada por nombre ilike)
- [ ] Ana Sin Empresa → `companyId` es null (campo empresa vacío, no da error porque `_companyLookup` no es required en contactos)

### Verificar en el CRM

- [ ] Ir a ficha de "Panadería López" → pestaña Contactos → aparece María López
- [ ] Ir a ficha de "Energía Sur SL" → pestaña Contactos → aparece Pedro Martín
- [ ] Email de María es `maria@panaderia.com` (lowercase)
- [ ] Teléfono de María es `+34600223344`
- [ ] Categoría de María es `A` (uppercase por `trimUpper`)

---

## TEST 4: Contactos — deduplicación por email

### Archivo: reimportar María con datos diferentes

```csv
Nombre;Email;Teléfono;Empresa;Categoría;Notas
María López García;maria@panaderia.com;600999888;12345678Z;A;Ahora es directora
```

### Verificar

- [ ] `updated: 1` (no inserted)
- [ ] Nombre actualizado a "María López García"
- [ ] Teléfono actualizado a `+34600999888`
- [ ] Notas: contiene "Gerente de la panadería" + `---` + "Ahora es directora"
- [ ] Source: no cambiado

---

## TEST 5: Puntos de suministro

### Archivo: `test_suministros.csv`

```csv
CUPS;Empresa;Dirección;Tarifa;Potencia P1;Potencia P2;Consumo Anual;Gasto Mensual;Comercializadora;Fin Contrato;Notas
ES0021000000000001AA;12345678Z;Calle Mayor 5, Orihuela;2.0TD;3,45;3,45;4.500;85,30€;Iberdrola;31/12/2026;Contrato vigente
ES0021000000000002BB;Energía Sur SL;Polígono Industrial 12;3.0TD;15;15;45.000,00;1.200,50;Endesa;15/06/2025;Vence pronto
```

### Pasos

1. Simular primero
2. Verificar: `inserted: 2`, `errors: 0`
3. Importar real

### Verificar

- [ ] CUPS 1 vinculado a "Panadería López" (por NIF `12345678Z`)
- [ ] CUPS 2 vinculado a "Energía Sur SL" (por nombre)
- [ ] Tarifa del CUPS 1: `2.0TD`
- [ ] Potencia P1 del CUPS 1: `3.45` (parseado desde formato español `3,45`)
- [ ] Consumo anual del CUPS 1: `4500` (parseado desde `4.500` — punto como separador de miles eliminado porque no hay coma)
- [ ] Gasto mensual del CUPS 1: `85.30` (parseado desde `85,30€`)
- [ ] Consumo anual del CUPS 2: `45000` (parseado desde `45.000,00`)
- [ ] Gasto mensual del CUPS 2: `1200.50` (parseado desde `1.200,50`)
- [ ] Fecha fin contrato CUPS 1: `2026-12-31` (parseado desde `31/12/2026`)
- [ ] Comercializadora: `Iberdrola` (trim)

---

## TEST 6: Puntos de suministro — empresa no encontrada

### Archivo

```csv
CUPS;Empresa;Tarifa
ES0021000000000003CC;Empresa Fantasma SL;2.0TD
```

### Verificar

- [ ] `errors: 1`
- [ ] Mensaje de error contiene: `Empresa no encontrada: "Empresa Fantasma SL"`
- [ ] El registro NO se inserta

---

## TEST 7: Casos borde

### 7.1 Archivo vacío (solo header)

```csv
Nombre;NIF;Email
```

- [ ] `totalRows: 0`, `errors: 0`, `inserted: 0`

### 7.2 Header no reconocible

```csv
Columna Rara;Otra Cosa
dato1;dato2
```

- [ ] Error: `Campos obligatorios no encontrados en headers: name`
- [ ] `errors: 1` con `rowIndex: 0` (error de estructura)

### 7.3 NIF inválido

```csv
Nombre;NIF
Test Corp;ABC
```

- [ ] La fila da error de validación: `Formato NIF/CIF inválido`

### 7.4 Email inválido

```csv
Nombre;Email
Test;no-es-email
```

- [ ] Error: `Formato de email inválido`

### 7.5 CUPS inválido (demasiado corto)

```csv
CUPS;Empresa
ES12345;12345678Z
```

- [ ] Error: `CUPS debe tener 20-22 caracteres`

### 7.6 CUPS inválido (no empieza por ES)

```csv
CUPS;Empresa
FR0021000000000001AA;12345678Z
```

- [ ] Error: `CUPS debe empezar por ES`

### 7.7 Tarifa inválida

```csv
CUPS;Empresa;Tarifa
ES0021000000000004DD;12345678Z;5.0TD
```

- [ ] Error: `Tarifa inválida. Válidas: 2.0TD, 3.0TD, 6.1TD, 6.2TD, 6.3TD, 6.4TD`

### 7.8 CP fuera de rango

```csv
Nombre;CP
Test;99001
```

- [ ] Error: `Código postal: prefijo provincial inválido`

### 7.9 Formato XLSX (no solo CSV)

- [ ] Crear un `.xlsx` con las mismas columnas que `test_empresas.csv`
- [ ] Importar y verificar que funciona igual

### 7.10 CSV con separador coma (no punto y coma)

```csv
Nombre,NIF,Email
Test Corp,B87654321,test@corp.com
```

- [ ] Autodetecta `,` como separador
- [ ] Importa correctamente

### 7.11 Archivo > 10MB

- [ ] Subir archivo de más de 10MB
- [ ] Respuesta: error 400, `Archivo demasiado grande`

### 7.12 Extensión no válida

- [ ] Subir archivo `.txt` o `.json`
- [ ] Respuesta: error 400, `Extensión de archivo no soportada`

### 7.13 Campos con comillas en CSV

```csv
Nombre;Dirección;NIF
"López, García y Asociados";"Calle ""Mayor"" 5";B11223344
```

- [ ] Nombre parseado como: `López, García y Asociados` (sin comillas)
- [ ] Dirección parseada como: `Calle "Mayor" 5` (comillas escapadas)

### 7.14 Fila completamente vacía

```csv
Nombre;NIF
Test;B11111111

```

- [ ] La fila vacía se marca como `skipped`, no como error

### 7.15 Headers con tildes y mayúsculas

```csv
TELÉFONO;DIRECCIÓN;CÓDIGO POSTAL;RAZÓN SOCIAL
666111222;Calle X;03001;Mi Empresa
```

- [ ] Headers detectados correctamente (normalización: quita tildes, lowercase, espacios→`_`)

---

## TEST 8: Verificación de deduplicación incorrecta

### Escenarios a verificar manualmente

1. **Empresa sin NIF deduplicada solo por nombre**
   - Importar empresa "Servicios Generales" sin NIF
   - Importar otra "servicios generales" (minúsculas) sin NIF
   - **Esperado:** Solo 1 empresa (ilike match). **Verificar que no hay 2.**

2. **Empresas con nombre similar pero NIF diferente**
   - Importar "ACME" con NIF `A11111111`
   - Importar "ACME" con NIF `A22222222`
   - **Esperado:** 2 empresas diferentes (NIF diferente tiene prioridad sobre nombre)

3. **Contacto re-importado con empresa diferente**
   - Importar contacto `juan@test.com` con empresa "ACME" (NIF `A11111111`)
   - Reimportar `juan@test.com` con empresa "Otra Corp" (NIF `B33333333`)
   - **Esperado:** 1 solo contacto. `companyId` actualizado a "Otra Corp".

4. **Punto de suministro, mismo CUPS, diferente empresa**
   - Importar CUPS `ES0021000000000005EE` con empresa "ACME"
   - Importar mismo CUPS con empresa "Otra Corp"
   - **Esperado:** 2 registros (dedup es CUPS+companyId, no solo CUPS)
   - **¿Es esto correcto para tu negocio?** Si un CUPS solo puede pertenecer a una empresa, esto es un punto a revisar post-MVP.

---

## TEST 9: Relaciones mal resueltas

### Verificar

1. **`_companyLookup` con nombre parcial**
   - Empresa registrada: "Energía Sur SL"
   - Importar contacto con empresa: "Energia Sur" (sin tilde, sin SL)
   - **Resultado:** Error — ilike busca match exacto del nombre completo, no parcial
   - El usuario debe poner el nombre exacto o usar el NIF

2. **`_companyLookup` con NIF con guiones**
   - Empresa registrada con NIF: `B12345678`
   - Importar contacto con empresa: `B-123.456.78`
   - **Resultado:** `resolveCompanyId` primero limpia a `B12345678` (regex test), luego busca por NIF → debería encontrar
   - **Verificar que funciona** — el regex `/^[A-Z0-9]{8,10}$/i` se aplica después de `replace(/[\s\-]/g, "")`

3. **Empresa creada por otro usuario**
   - Si user A importó empresa "Test Corp" con NIF `B99999999`
   - User B intenta importar contacto con `_companyLookup: B99999999`
   - **Resultado:** No encuentra (filtro por userId). El contacto da error.
   - **Esto es correcto** — multitenant, cada usuario ve solo sus datos

---

## TEST 10: Audit trail

Después de cada importación real (no dry run):

1. Consultar tabla `auditEvents`:
   ```sql
   SELECT * FROM audit_events 
   WHERE event_type = 'import_batch' 
   ORDER BY created_at DESC 
   LIMIT 5;
   ```

2. Verificar:
   - [ ] `eventId` empieza con `evt_import_`
   - [ ] `userId` es el del usuario que importó
   - [ ] `result` es `"success"` o `"partial"` (si hubo errores)
   - [ ] `metadata` contiene: `entity`, `totalRows`, `inserted`, `updated`, `errors`, `durationMs`, `headerMapping`
