# Task 1: Fix name duplicates and Couple handling

## Agent: Name Fix Agent

## Changes Made

### 1. Created `/src/lib/guest-utils.ts`
- `cleanGuestName(firstName, lastName)` utility function
- Case-insensitive duplicate word removal (e.g., "DIEGO DIEGO" → "DIEGO")
- "Couple" prefix detection in firstName or lastName
- Returns: `displayName`, `isCouple`, `coupleName`, `greeting`, `shortGreeting`
- Couple greeting: "Invitation exclusive pour le Couple {name}"
- Regular greeting: "Invitation exclusive pour {name}"

### 2. Updated `/src/app/api/guest/lookup/route.ts`
- Uses `cleanGuestName()` for the `name` field in API response
- Added `isCouple` and `greeting` fields to response
- Raw firstName/lastName preserved in response for client-side use

### 3. Updated `/src/components/GuestPersonalSpace.tsx`
- Uses `cleanGuestName()` for hero name display
- Couple entries: "Invitation exclusive pour le" prefix
- Regular entries: "Invitation exclusive pour" prefix
- QR code alt text uses cleaned displayName

### 4. Updated `/src/components/GuestAuthForm.tsx`
- Added `isCouple` and `greeting` to `LookupResult` interface
- Authenticating state uses `cleanGuestName()` for display
- Search result names already cleaned by API

## Key Decisions
- All cleaning is display-only; database is never modified
- Utility is shared between backend API and frontend components
- "Couple" is treated as a status indicator, not a name
