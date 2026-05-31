---
Task ID: 1
Agent: Main Agent
Task: Continue building the premium wedding platform for Josué & Hornella

Work Log:
- Copied real couple photos (2f5b9c54-39ec-4d1c-9ad8-48ab63ae1d73.jpeg → couple-photo-1.jpeg, IMG_6300.png → couple-photo-2.png) to /public/upload/
- Fixed HeroSection.tsx bug: removed unused `calculateTimeLeft()` function and `DEFAULT_WEDDING_DATE` constant, replaced `WEDDING_DATE` reference with inline date
- Fixed Navigation.tsx: changed mobile sidebar title from "A & B" to "J & H"
- Updated SettingsManager.tsx: added `venue_reference` and `invitation_message` fields, reorganized settings groups with proper "Informations du Mariage" and "Invitation Digitale" sections
- Pushed Prisma schema to database (already in sync)
- Created seed script at prisma/seed.ts with default admin user, settings, tables, guests, timeline events, and couple stories
- Ran seed script - database already had data from previous session
- Verified all API endpoints work: /api/settings, /api/timeline, /api/guests/search, /api/admin/login
- Ran ESLint - no errors
- Dev server running on port 3000

Stage Summary:
- Platform is fully functional with all components: HeroSection, GuestSearch, InvitationCard, CoupleGallery, EventTimeline, MapSection, Footer, Navigation, AdminPanel
- Real couple photos are being used throughout (not AI-generated)
- Admin login: admin@josue-hornella.wedding / admin2026
- Database has 229 guests, 28 tables, 12 timeline events, 4 couple stories
- Wedding details: Josué & Hornella, Vendredi 26 Juin 2026, Salle Polyvalente – Grand Palais Kinshasa, 21/22 Avenue Bobozo
