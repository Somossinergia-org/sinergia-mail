/**
 * Mock DB module — prevents real database connections during tests.
 * All imports of @/db resolve here via vitest alias.
 */
export const db = {
  select: () => ({ from: () => ({ where: () => Promise.resolve([{ count: 0 }]) }) }),
  insert: () => ({ values: () => Promise.resolve() }),
  update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
};

export const schema = {
  emails: {},
  invoices: {},
  contacts: {},
  issuedInvoices: {},
  memorySources: {},
  memoryRules: {},
  agentPerformance: {},
};
