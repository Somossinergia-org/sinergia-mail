# Paquete K — Sinergia Memory (NotebookLM-style nativo)

**Fecha**: 2026-04-14
**Scope**: Sistema de memoria persistente con búsqueda semántica para Sinergia AI.

---

## Objetivo

Que el agente recuerde información importante entre conversaciones y la
encuentre aunque el usuario describa las cosas de forma vaga o con
palabras diferentes.

Ejemplos que deben funcionar:
- *"qué sé sobre Endesa"* → recupera emails + facturas + notas que la mencionen
- *"apunta que los cobros a Wind to Market son cada 30"* → guarda nota
- *"el contrato que me enviaron en marzo con cláusula de renovación"* →
  encuentra el PDF aunque no recuerdes el asunto exacto
- Arrastras PDF al chat → "recuérdalo" → indexa todo el texto

---

## Stack técnico

### 1. Embeddings

- Modelo: `text-embedding-004` de Google (768 dimensiones)
- Mismo proyecto Gemini que ya uso — 0 setup adicional
- Coste: ~$0.000025/1k tokens → indexar todos tus datos cuesta céntimos

### 2. Vector store: pgvector

- Extensión Postgres ya disponible en Cloud SQL
- Tabla `memory_sources` con columna `embedding vector(768)`
- Índice IVFFlat para similarity search O(log n)
- Búsqueda: `ORDER BY embedding <=> $query_embedding LIMIT N` (cosine distance)

### 3. Schema

```sql
CREATE TABLE memory_sources (
  id            SERIAL PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          VARCHAR(20) NOT NULL,
    -- 'email' | 'invoice' | 'pdf' | 'note' | 'url' | 'contact'
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,       -- texto completo a indexar
  summary       TEXT,                -- resumen generado por Gemini (opcional)
  embedding     vector(768),         -- vector Gemini
  metadata      JSONB,               -- {emailId, invoiceId, url, pdfHash, ...}
  source_ref_id INTEGER,             -- foreign key numérico a emails/invoices
  tags          TEXT[],              -- etiquetas libres
  starred       BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX memory_sources_user_idx ON memory_sources (user_id);
CREATE INDEX memory_sources_kind_idx ON memory_sources (kind);
CREATE INDEX memory_sources_embedding_idx
  ON memory_sources USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);
```

### 4. Chunking para fuentes largas

Si un PDF tiene 10 páginas → troceo en pasajes de ~500 tokens. Cada trozo
es una fila `memory_sources` con `metadata.chunk_index` y mismo `title`.
La búsqueda retorna trozos individualmente — mejor para precisión.

### 5. Helper `src/lib/memory.ts`

- `embed(text: string): Promise<number[]>`
- `addSource({userId, kind, title, content, metadata, refId}): Promise<id>`
- `searchMemory(userId, query, limit = 5): Promise<Source[]>`
- `chunkText(text, maxTokens = 500): string[]` (palabras, no tokens reales)
- `summarizeIfLong(text): Promise<string | null>` (si >2000 chars, Gemini
  resume en 200)

### 6. Ingesta automática

Durante el sync:
- Cada email nuevo con categoría CLIENTE/PROVEEDOR/LEGAL/FACTURA → crea
  source tipo `email` con su body
- Cada factura nueva extraída (con PDF) → source tipo `invoice` con el
  rawText del PDF + metadata (issuerName, total, date)

Ingesta manual:
- Drop de PDF en FloatingAgent → si el usuario dice "recuerda" → source
  tipo `pdf`
- Cuando se crea factura emitida → source tipo `invoice` con concepto
- Cuando el agente crea una nota → `memory_add` tool

### 7. Tools agénticas

- `memory_search(query, kind?, limit?)` — búsqueda semántica top-N
- `memory_add(title, content, kind?)` — añadir nota/fuente
- `memory_star(source_id)` / `memory_unstar(source_id)`
- `memory_delete(source_id)`
- `memory_list(kind?, limit?)` — listar sources (sin búsqueda)

### 8. Prompt enriquecido

Antes de cada respuesta del chat, opcionalmente ejecuto `memory_search`
con la query del usuario. Top 3 resultados se inyectan como contexto
automático. Esto convierte **cada pregunta** en una consulta con memoria
sin que el agente tenga que decidirlo cada vez.

### 9. UI Panel "Memoria" en sidebar

- Lista de sources con filtros por `kind` y `tags`
- Buscador semántico arriba (input + resultados rankeados por similarity)
- Formulario "Nueva nota" (title + content + tags)
- Drop zone para PDFs que van directo a memoria
- Estrella ⭐ para marcar favoritos (prioriza en búsquedas)
- Click en source → modal con contenido completo + editar/borrar

---

## Plan de commits

1. `feat: pgvector + memory_sources schema + migration`
2. `feat: embedding helper + memory CRUD + 5 tools agénticas`
3. `feat: auto-ingest de emails y facturas al sync`
4. `feat: MemoriaPanel UI con búsqueda semántica + añadir notas + drop PDF`
5. `feat: FloatingAgent consulta memoria en cada turno`

---

## Criterios de éxito

- [ ] pgvector disponible en Cloud SQL
- [ ] Indexación de 197 emails en <60s (batched embeddings)
- [ ] Pregunta "qué sé sobre Buen Fin de Mes" encuentra el email original
- [ ] Nota creada desde chat persistente entre sesiones
- [ ] Drop de PDF de 5 páginas en chat → indexa 10+ chunks en <8s
- [ ] FloatingAgent responde incorporando contexto de memoria automáticamente

---

**Procedo.**
