# Merge Lab

Merge Lab is an interactive web application for learning the **Merge**
operation in the Minimalist Program.

Users create lexical items, move them around a canvas, and Merge compatible
expressions while observing category features, selectional features, feature
checking, projection, and ill-formed subtrees.

## Features

- Create lexical items with:
  - a spelling
  - one category feature: `N`, `V`, `A`, or `P`
  - any number of uninterpretable features: `uN`, `uV`, `uA`, or `uP`
- Drag lexical items and trees freely around the canvas.
- Merge a pair when one expression has an unchecked `uX` feature and the other
  expression has category `X`.
- Display checked features with a strikethrough.
- Determine the head from the expression whose uninterpretable feature is
  checked.
- Project the head category to the mother node.
- Label projections as:
  - `XP` when the head has no unchecked uninterpretable features
  - `X′` when unchecked uninterpretable features remain
- Merge lexical items with trees, or trees with other trees.
- Mark a non-head daughter red when it retains an unchecked uninterpretable
  feature.
- Detach a leaf or a root daughter and undo the feature check introduced by
  that Merge operation.
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

## Using the application

1. Start the development server and open the application.
2. Select the `+` button to create a lexical item.
3. Enter its spelling, category, and optional uninterpretable features.
4. Drag one expression toward another.
5. When a translucent green circle and **Release to Merge** appear, release the
   pointer to Merge them.
6. Drag the resulting tree to use it in another Merge operation.
7. Hover over a detachable leaf or root daughter and select its `×` button to
   separate it from the tree.

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
