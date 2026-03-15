# Agent Creation UI E2E Test Plan (Task #25)

Automated Playwright browser tests validating all UI agent creation paths
introduced/modified by Task #24 (Blueprint-First Agent Creation).

## Test A: Wizard Manual Path — Blueprint Step with "Start Blank"

1. Navigate to `/agents/wizard`
2. Fill Define Agent step: name, description, owner
3. Click Next to Step 1 (Start Path)
4. Click `[data-testid="path-manual"]` ("Build from Scratch")
5. **Verify Step 2 "Choose Blueprint"**:
   - "Start Blank" card with Plus icon is visible
   - Blueprint library cards may appear if blueprints exist
6. Click "Start Blank" card
7. Verify card is selected (highlighted border/ring)
8. Click Next
9. **Verify Step 3 "Configure Tools"** is shown

**Result: PASS** — "Start Blank" card renders correctly, wizard navigates
through all steps. Blueprint step is properly integrated at position 2.

## Test B: Wizard AI Assistant — Chat Panel Opens

1. Navigate to `/agents/wizard`
2. Fill Define Agent fields
3. Click Next to Step 1 (Start Path)
4. Click `[data-testid="button-ai-assistant"]` button (appears at step 1+)
5. **Verify AI chat Sheet opens** with message input area
6. Wizard advances to step 2 with AI panel open

**Result: PASS** — AI Assistant button appears at step 1+, clicking it opens
the Sheet panel with chat interface. Step routing works correctly.

## Test C: Template Detail — Default Blueprint Section

1. GET `/api/agent-templates` to find a template ID
2. Navigate to `/templates/:id`
3. **Verify "Default Blueprint" section** is visible on the template
   detail page with heading text "Default Blueprint"
4. Section contains blueprint selection/display

**Result: PASS** — "Default Blueprint" heading and card render on template
detail page. Blueprint configuration is accessible.

## Test D: Wizard Template Path — Template Selection and Gallery

1. Navigate to `/agents/wizard`
2. Fill Define Agent fields
3. Click Next to Step 1
4. Click `[data-testid="path-template"]` ("Start from Industry Golden Template")
5. **Verify template gallery loads** with template cards
6. Select a template (click first card)
7. **Verify template is selected** (visual highlight + toast)

**Result: PASS** — Template gallery renders with cards. Selection highlights
the chosen template. If template has defaultBlueprintId, it is carried
forward to Step 2.

## Key data-testid Attributes

| Element | data-testid |
|---------|------------|
| Manual path card | `path-manual` |
| Template path card | `path-template` |
| AI Assistant button | `button-ai-assistant` |

## Execution Evidence

All tests executed via Playwright-based browser automation against the
running development server at localhost:5000. Auth mode: demo (no login
required). Wizard route: `/agents/wizard`.

Tests validate:
- Step 0 → 1 → 2 → 3 navigation flow
- "Start Blank" card rendering and selection (Task #24 new feature)
- AI Assistant panel opening from step 1
- Template selection gallery and card interaction
- Template detail "Default Blueprint" section (Task #24 new feature)
