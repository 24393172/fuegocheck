# Code Conventions — Fuego & Seguridad

## Language

- UI text, labels, placeholders, error messages → **Spanish**
- Variable names, function names, file names, comments → **English**
- Git commits → **English**

---

## TypeScript

- Strict mode enabled — no `any` unless absolutely unavoidable
- Prefer `interface` for object shapes, `type` for unions/aliases
- All async functions have explicit return types
- No implicit `undefined` returns — be explicit

```typescript
// ✅ Good
async function getInspectionById(id: string): Promise<Inspection | null> { ... }

// ❌ Bad
async function getInspectionById(id) { ... }
```

---

## File naming

- Components: `PascalCase.tsx` → `InspectionCard.tsx`
- Utilities / libs: `kebab-case.ts` → `pdf-generator.ts`
- Repositories: `kebab-case.repo.ts` → `inspections.repo.ts`
- Schemas: `kebab-case.schema.ts` → `pump-form.schema.ts`
- Types: `kebab-case.types.ts` → `inspection.types.ts`
- Screens (Expo Router): `kebab-case.tsx` → `fill.tsx`

---

## Component structure

```typescript
// 1. Imports
import React, { useState } from 'react'
import { View, Text } from 'react-native'

// 2. Types (local to this file)
interface Props { ... }

// 3. Component
export default function ComponentName({ prop }: Props) {
  // 3a. State
  // 3b. Effects
  // 3c. Handlers
  // 3d. Render helpers (small functions that return JSX)
  // 3e. Return
}
```

---

## Repository functions

Each repository file exports standalone async functions. No classes.

```typescript
// ✅ Good
export async function saveInspection(input: CreateInspectionInput): Promise<Inspection> { ... }
export async function updateInspectionStatus(id: string, status: InspectionStatus): Promise<void> { ... }

// ❌ Bad — don't do this
class InspectionRepository {
  async save(input: CreateInspectionInput) { ... }
}
```

---

## Error handling

- User-facing errors: Spanish, clear, actionable
- Never swallow errors silently (`catch (e) {}` is forbidden)
- Log errors to console.error with context
- Show user feedback for every failure

```typescript
// ✅ Good
try {
  await generatePDF(inspection)
} catch (error) {
  console.error('[pdf-generator] Failed to generate PDF:', error)
  showErrorToast('No se pudo generar el PDF. Intenta de nuevo.')
}

// ❌ Bad
try {
  await generatePDF(inspection)
} catch {}
```

---

## SQLite queries

- All queries go through repository functions — never write SQL directly in screens
- Use parameterized queries — never string concatenate SQL
- Always handle the case where a query returns nothing

```typescript
// ✅ Good
const result = await db.getFirstAsync<InspectionRow>(
  'SELECT * FROM inspections WHERE id = ?',
  [id]
)
return result ?? null

// ❌ Bad
const result = await db.getFirstAsync(`SELECT * FROM inspections WHERE id = '${id}'`)
```

---

## Zustand store

- Store only holds: active inspection draft, UI loading states, error states
- Never duplicate SQLite data in the store
- Clear store state when navigating away from a form

---

## Comments

Write comments for **why**, not **what**:

```typescript
// ✅ Good — explains why
// documentDirectory persists across reboots, cacheDirectory does not
const dir = `${FileSystem.documentDirectory}inspections/${id}/`

// ❌ Bad — explains what (the code already says that)
// set the directory variable
const dir = `${FileSystem.documentDirectory}inspections/${id}/`
```

---

## Commit messages

```
feat: add signature capture to pump inspection form
fix: photos not persisting after app restart
refactor: extract pdf template to separate function
chore: update expo-image-manipulator to 12.0.1
```

Format: `type: description in present tense`
Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`
