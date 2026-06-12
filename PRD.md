# PRD — Fuego & Seguridad Mobile App

## Problem

Fire suppression system technicians at "Fuego & Seguridad" currently fill paper
forms during on-site inspections of fire pumps and other equipment. These forms
must then be manually delivered or transcribed and stored by the company secretary.

This process causes:
- Risk of lost or damaged forms
- Delay between inspection and record storage
- No photographic evidence attached to records
- No consistent format enforcement
- Difficult historical lookup

## Solution

Android mobile app that:
1. Guides technicians through digital inspection forms
2. Captures photographic evidence in-app
3. Captures digital signatures
4. Auto-generates a professional PDF report
5. Automatically emails the PDF to the company secretary

## Users

**Primary: Field technicians (2-3 people)**
- Work at hotels, shopping malls, large facilities
- May have limited technical literacy
- Often work in areas with poor or no connectivity
- Need speed — inspections happen during client visits
- Use Android phones

**Secondary: Company secretary (1 person)**
- Receives PDF reports via email
- Does not use the app directly
- Stores and manages inspection history

## Core Requirements

### Must have (MVP)
- Fill fire pump inspection form on Android
- Checklist fields: SI / NO / N/A
- Text and number fields
- Take/attach photos from camera or gallery
- Capture touch signature (technician + optional client)
- Autosave on every change (never lose work)
- Save drafts
- Complete inspection → generate PDF → email automatically
- Works fully offline, emails when connectivity returns
- View history of past inspections locally
- App is simple and fast (technician completes inspection in under 10 minutes)

### Should have (post-MVP)
- PDF preview before sending
- Retry failed email sends manually
- Filter/search history
- Settings screen for technician name + email recipient

### Will not have (out of scope)
- Web interface
- Cloud sync or database
- User accounts / login
- Multiple company support
- iOS version (Android only)
- Play Store distribution

## Non-Functional Requirements

### Offline-first
App must be 100% functional without internet.
Inspections are saved locally. PDF generated locally.
Email queued and sent automatically when internet returns.

### Reliability
- Never lose an inspection in progress
- Autosave on every field change
- If app crashes mid-inspection, data is recoverable

### Performance
- App launch: under 3 seconds
- Form navigation: instant
- PDF generation: under 10 seconds
- Photo capture to display: under 2 seconds

### Privacy & Security
- No data leaves the device except via email to the configured recipient
- No analytics, no tracking, no third-party SDKs beyond functional ones
- Photos stored in private app directory (not accessible by other apps)
- EmailJS credentials stored in app config (not user-visible)

### Maintainability
- New form types (extinguishers, etc.) addable without touching core code
- Two junior developers can understand any file without asking each other
- No framework magic — if you can't trace the flow, it's too complex

## Success Criteria

At end of 4 months:
- Technician can complete a full pump inspection with photos and signatures
- PDF is generated and emailed automatically
- App works without internet during inspection
- Secretary receives professional PDF with all data
- Zero paper forms used in a real inspection

## Future Scope (not in this project)

- Extinguisher inspection forms
- Emergency lighting inspection forms
- Dashboard/analytics for management
- Scheduled inspection reminders
- Client portal to view their inspection history
