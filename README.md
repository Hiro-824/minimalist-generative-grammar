# Merge Lab

Merge Lab is an interactive web application for learning the **Merge**
operation in the Minimalist Program.

Users create lexical items, move them around a canvas, and Merge compatible
expressions while observing category features, selectional features, feature
checking, projection, and ill-formed subtrees.

## Features

- Create lexical items with:
  - a spelling
  - one category feature: `N`, `V`, `v`, `A`, or `P`
  - any number of uninterpretable features: `uN`, `uV`, `uv`, `uA`, or `uP`
- Drag lexical items and trees freely around the canvas.
- Remove any top-level lexical item or tree by dragging it onto the trash zone.
- Undo the most recent removal from the bottom notification.
- Merge a pair when one expression has an unchecked `uX` feature and the other
  expression has category `X`.
- Display checked features with a strikethrough.
- Determine the head from the expression whose uninterpretable feature is
  checked.
- Linearize daughters with the current internal Head Initial setting.
- Enforce the Hierarchy of Projection for `v`: a `v` head must first merge
  with a VP complement before checking another c-selectional feature.
- Project the head category to the mother node.
- Label projections as:
  - `X′` when some c-selectional features have been checked but others remain
    unchecked
  - `XP` when all c-selectional features have been checked
- Merge lexical items with trees, or trees with other trees.
- Mark a non-head daughter red when it retains an unchecked uninterpretable
  feature.
- Check every top-level structure for Full Interpretation. A structure satisfies
  Full Interpretation when no active uninterpretable feature remains anywhere
  in its lexical leaves.
- Detach one of the current root node's two daughters and undo the feature
  check introduced by that Merge operation.
- Show a circular drop indicator when the dragged expression is within Merge
  range of a compatible target.

## Merge rules

Merge succeeds only when feature checking can occur.

For example:

```text
to [P, uN]
Peter [N]
```

`to` selects an `N` expression through `uN`, so the result is:

```text
          PP
         /  \
to [P, uN]  Peter [N]
       ──
```

The application internally marks `uN` as checked and renders it with a
strikethrough. `to` is the head, so the mother inherits category `P`.

The resulting `PP` can then Merge with:

```text
letters [N, uP]
```

because `letters` has an unchecked `uP` feature and the tree projects category
`P`.

Merge is rejected when neither expression has an unchecked feature matching the
other expression's category.

## Full Interpretation

Each top-level expression on the canvas is checked recursively before it reaches
the conceptual semantic interface:

- **Full Interpretation** means that no active uninterpretable feature remains.
- **Uninterpretable: ...** lists features that are still unchecked.

Features carry explicit `interpretable` and `kind` metadata internally. The
current UI creates category features as interpretable and c-selectional
features as uninterpretable. This model allows future uninterpretable feature
types to participate in Full Interpretation without relying on a `u` naming
prefix.

## Linearization

The application currently uses **Head Initial** linearization:

- the first Merge with a lexical head introduces a **Complement**, placed to
  the right of the head;
- a Merge with an already projected head introduces a **Specifier**, placed to
  the left of the projection.

This distinction is structural and does not depend on whether the previous
Merge checked a c-selectional feature. Consequently, Hierarchy of Projection
can license `v + VP` without `uV`. If `v` still has another unchecked
c-selectional feature, the result is `v′`, and the next feature-checking Merge
targets that projection and introduces a left-side Specifier.

Projection labels are calculated separately from the Complement/Specifier
distinction. A head with any unchecked c-selectional feature projects `X′`;
once all of its c-selectional features are checked, it projects `XP`.

Head Final behavior remains represented internally for future use, but is not
currently exposed as a user setting.

## Hierarchy of Projection

The category inventory includes lowercase `v`. A `v` head must contain a
category `V` projection as its complement before one of its other
c-selectional features can be checked.

Hierarchy of Projection independently licenses Merge between `v` and a VP.
Therefore, `v` can take a VP complement even when it has no `uV` feature. If
`uV` is present, ordinary feature checking can license the same Merge.

If another c-selectional feature such as `uN` is checked before that VP
complement is present, Merge still applies, but the violating `v` subtree is
displayed in red.

The application also displays warning notifications when:

- a non-head still contains an unchecked c-selectional feature;
- `v` violates the Hierarchy of Projection.

## Using the application

1. Start the development server and open the application.
2. Select the `+` button to create a lexical item.
3. Enter its spelling, category, and optional uninterpretable features.
4. Drag one expression toward another.
5. When a translucent green circle and **Release to Merge** appear, release the
   pointer to Merge them.
6. Drag the resulting tree to use it in another Merge operation.
7. Hover over either daughter immediately below the root and select its `×`
   button to separate it from the tree.
8. Drag a top-level item or tree onto the trash zone and release it to remove
   it from the canvas.

The initial canvas contains:

```text
letters [N, uP]
to [P, uN]
Peter [N]
```

These items demonstrate the intended sequence:

```text
Merge(to, Peter) → PP
Merge(letters, PP) → NP
```

## Development

Requirements:

- Node.js 22 LTS (see `.nvmrc`)
- npm

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The default development command uses Webpack. This avoids intermittent
Turbopack development-cache inconsistencies where a React Server Components
client manifest can refer to a module that is missing after Fast Refresh.

To test with Turbopack explicitly:

```bash
npm run dev:turbo
```

Do not run `dev` and `dev:turbo` simultaneously against the same working tree.
If switching bundlers produces stale-module errors, stop the server, remove the
generated `.next` directory, and restart it.

Run static checks:

```bash
npm run lint
```

Create a production build:

```bash
npm run build
```

Run the production server after building:

```bash
npm run start
```

## Technology

- Next.js 16 App Router
- React 19
- TypeScript
- SVG for syntax-tree rendering
- CSS for the canvas, modal, drag feedback, and tree presentation

No external tree-layout or drag-and-drop library is currently required.

## Project structure

```text
app/
├── global-error.tsx     # Explicit root error boundary
├── globals.css          # Canvas, tree, modal, and interaction styles
├── layout.tsx           # Root layout and metadata
├── merge-workspace.tsx  # Data model, Merge logic, drag handling, and SVG tree
└── page.tsx             # Application entry page
```

The main logic in `app/merge-workspace.tsx` is separated into functions for:

- locating a valid head
- checking and unchecking projected features
- constructing a merged syntax node
- recalculating labels and ill-formed state
- detaching permitted nodes
- calculating symmetric tree coordinates
- preserving the stationary daughter's position after Merge

## Current scope

This is an MVP focused on External Merge and visual feature checking. It does
not currently implement:

- Move or Internal Merge
- Agree
- phases
- spell-out
- manual feature editing
- persistence
- user accounts
- an automated lesson system
