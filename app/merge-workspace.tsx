"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

type Category = "N" | "V" | "A" | "P";
type UninterpretableFeature = `u${Category}`;

type Feature = {
  value: Category | UninterpretableFeature;
  checked: boolean;
};

type SyntaxNode = {
  id: string;
  type: "lexical" | "merged";
  spelling?: string;
  category: Category;
  features: Feature[];
  label?: string;
  children?: SyntaxNode[];
  headChildId?: string;
  checkedFeature?: UninterpretableFeature;
  x: number;
  y: number;
  illFormed?: boolean;
};

type TreeLayoutNode = {
  node: SyntaxNode;
  x: number;
  y: number;
  parentX?: number;
  parentY?: number;
  inheritedIllFormed: boolean;
};

type MergeCandidate = {
  node: SyntaxNode;
  isValid: boolean;
};

const CATEGORIES: Category[] = ["N", "V", "A", "P"];
const UNINTERPRETABLE_FEATURES: UninterpretableFeature[] = [
  "uN",
  "uV",
  "uA",
  "uP",
];
const LEAF_WIDTH = 170;
const LEVEL_HEIGHT = 78;
const MERGE_RADIUS = 80;
const SIBLING_GAP = 28;

const initialNodes: SyntaxNode[] = [
  {
    id: "letters",
    type: "lexical",
    spelling: "letters",
    category: "N",
    features: [
      { value: "N", checked: false },
      { value: "uP", checked: false },
    ],
    x: 120,
    y: 210,
  },
  {
    id: "to",
    type: "lexical",
    spelling: "to",
    category: "P",
    features: [
      { value: "P", checked: false },
      { value: "uN", checked: false },
    ],
    x: 430,
    y: 390,
  },
  {
    id: "peter",
    type: "lexical",
    spelling: "Peter",
    category: "N",
    features: [{ value: "N", checked: false }],
    x: 720,
    y: 390,
  },
];

function treeDepth(node: SyntaxNode): number {
  if (!node.children?.length) return 1;
  return 1 + Math.max(...node.children.map(treeDepth));
}

function getTreeHalfWidth(node: SyntaxNode): number {
  if (!node.children?.length) return LEAF_WIDTH / 2;
  const [left, right] = node.children;
  const leftHalf = getTreeHalfWidth(left);
  const rightHalf = getTreeHalfWidth(right);
  const childOffset = (leftHalf + rightHalf) / 2 + SIBLING_GAP;
  return Math.max(
    LEAF_WIDTH / 2,
    childOffset + leftHalf,
    childOffset + rightHalf,
  );
}

function getNodeSize(node: SyntaxNode) {
  return {
    width: getTreeHalfWidth(node) * 2,
    height: treeDepth(node) * LEVEL_HEIGHT,
  };
}

function hasUncheckedFeature(node: SyntaxNode) {
  return node.features.some(
    (feature) => feature.value.startsWith("u") && !feature.checked,
  );
}

function subtreeHasUncheckedFeature(node: SyntaxNode): boolean {
  if (hasUncheckedFeature(node)) return true;
  return node.children?.some(subtreeHasUncheckedFeature) ?? false;
}

function checkHeadFeature(
  node: SyntaxNode,
  value: UninterpretableFeature,
): SyntaxNode {
  let checkedProjectedFeature = false;
  const features = node.features.map((feature) => {
    if (
      checkedProjectedFeature ||
      feature.value !== value ||
      feature.checked
    ) {
      return feature;
    }
    checkedProjectedFeature = true;
    return { ...feature, checked: true };
  });

  if (node.type === "lexical" || !node.children || !node.headChildId) {
    return { ...node, features };
  }

  // Projected features are mirrored down the head path so the lexical head
  // also displays the checked feature with a strikethrough.
  let checkedHeadChild = false;
  const children = node.children.map((child) => {
    if (child.id !== node.headChildId || checkedHeadChild) return child;
    checkedHeadChild = true;
    return checkHeadFeature(child, value);
  });

  return { ...node, features, children };
}

function uncheckHeadFeature(
  node: SyntaxNode,
  value: UninterpretableFeature,
): SyntaxNode {
  let uncheckedProjectedFeature = false;
  const features = node.features.map((feature) => {
    if (
      uncheckedProjectedFeature ||
      feature.value !== value ||
      !feature.checked
    ) {
      return feature;
    }
    uncheckedProjectedFeature = true;
    return { ...feature, checked: false };
  });

  if (node.type === "lexical" || !node.children || !node.headChildId) {
    return { ...node, features };
  }

  const children = node.children.map((child) =>
    child.id === node.headChildId
      ? uncheckHeadFeature(child, value)
      : child,
  );
  return { ...node, features, children };
}

function findHeadCandidate(
  possibleHead: SyntaxNode,
  complement: SyntaxNode,
): UninterpretableFeature | null {
  const expected = `u${complement.category}` as UninterpretableFeature;
  const match = possibleHead.features.find(
    (feature) => feature.value === expected && !feature.checked,
  );
  return match ? expected : null;
}

function createMerge(
  first: SyntaxNode,
  second: SyntaxNode,
): SyntaxNode | null {
  // The moving item is considered first only to resolve the rare case where
  // both daughters can select each other; either direction is otherwise valid.
  const firstMatch = findHeadCandidate(first, second);
  const secondMatch = findHeadCandidate(second, first);
  const head = firstMatch ? first : secondMatch ? second : null;
  const checkedValue = firstMatch ?? secondMatch;

  if (!head || !checkedValue) return null;

  const nonHead = head.id === first.id ? second : first;
  const checkedHead = checkHeadFeature(head, checkedValue);
  const markedNonHead = subtreeHasUncheckedFeature(nonHead)
    ? { ...nonHead, illFormed: true }
    : nonHead;
  const hasRemainingSelection = hasUncheckedFeature(checkedHead);
  const label = hasRemainingSelection
    ? `${checkedHead.category}′`
    : `${checkedHead.category}P`;
  const firstChild = head.id === first.id ? checkedHead : markedNonHead;
  const secondChild = head.id === second.id ? checkedHead : markedNonHead;
  const firstCenterX = first.x + getNodeSize(first).width / 2;
  const secondCenterX = second.x + getNodeSize(second).width / 2;

  return {
    id: crypto.randomUUID(),
    type: "merged",
    category: checkedHead.category,
    // A merged node projects the head's features for later Merge operations.
    features: checkedHead.features.map((feature) => ({ ...feature })),
    label,
    // Preserve the daughters' left-to-right relation at the moment of Merge.
    children:
      firstCenterX <= secondCenterX
        ? [firstChild, secondChild]
        : [secondChild, firstChild],
    headChildId: checkedHead.id,
    checkedFeature: checkedValue,
    x: 0,
    y: 0,
  };
}

function canMerge(first: SyntaxNode, second: SyntaxNode) {
  return Boolean(
    findHeadCandidate(first, second) || findHeadCandidate(second, first),
  );
}

function findMergeCandidate(
  nodes: SyntaxNode[],
  moving: SyntaxNode,
): MergeCandidate | null {
  const movingSize = getNodeSize(moving);
  const movingCenter = {
    x: moving.x + movingSize.width / 2,
    y: moving.y + movingSize.height / 2,
  };

  const target = nodes
    .filter((node) => node.id !== moving.id)
    .map((node) => {
      const size = getNodeSize(node);
      const center = {
        x: node.x + size.width / 2,
        y: node.y + size.height / 2,
      };
      const distance = Math.hypot(
        movingCenter.x - center.x,
        movingCenter.y - center.y,
      );
      return { node, distance };
    })
    .filter((candidate) => candidate.distance <= MERGE_RADIUS)
    .sort((a, b) => a.distance - b.distance)[0]?.node;

  return target ? { node: target, isValid: canMerge(moving, target) } : null;
}

function positionMergedFromStationaryDaughter(
  merged: SyntaxNode,
  stationary: SyntaxNode,
) {
  const mergedSize = getNodeSize(merged);
  const stationaryRoot = {
    x: stationary.x + getNodeSize(stationary).width / 2,
    y: stationary.y + 24,
  };
  const stationaryInMergedTree = buildTreeLayout(
    merged,
    mergedSize.width,
  ).find((item) => item.node.id === stationary.id);

  if (!stationaryInMergedTree) return merged;

  return {
    ...merged,
    // Keep the stationary daughter's root at exactly the same canvas point.
    x: stationaryRoot.x - stationaryInMergedTree.x,
    y: stationaryRoot.y - stationaryInMergedTree.y,
  };
}

function clearRootIllFormed(node: SyntaxNode): SyntaxNode {
  return { ...node, illFormed: false };
}

function refreshMergedNode(node: SyntaxNode): SyntaxNode {
  if (node.type === "lexical" || !node.children || !node.headChildId) {
    return clearRootIllFormed(node);
  }

  const refreshedChildren = node.children.map(refreshMergedNode);
  const head = refreshedChildren.find((child) => child.id === node.headChildId);
  if (!head) return clearRootIllFormed(node);
  const children = refreshedChildren.map((child) =>
    child.id !== head.id && subtreeHasUncheckedFeature(child)
      ? { ...child, illFormed: true }
      : child,
  );

  return {
    ...node,
    category: head.category,
    features: head.features.map((feature) => ({ ...feature })),
    label: hasUncheckedFeature(head) ? `${head.category}′` : `${head.category}P`,
    children,
    illFormed: false,
  };
}

function detachNode(
  root: SyntaxNode,
  targetId: string,
): { remaining: SyntaxNode; detached: SyntaxNode } | null {
  if (!root.children || !root.checkedFeature || !root.headChildId) return null;
  const directIndex = root.children.findIndex((child) => child.id === targetId);

  if (directIndex >= 0) {
    const selected = clearRootIllFormed(root.children[directIndex]);
    const sibling = root.children[directIndex === 0 ? 1 : 0];
    const detached =
      selected.id === root.headChildId
        ? uncheckHeadFeature(selected, root.checkedFeature)
        : selected;
    const remaining =
      sibling.id === root.headChildId
        ? uncheckHeadFeature(sibling, root.checkedFeature)
        : sibling;
    return {
      remaining: refreshMergedNode(clearRootIllFormed(remaining)),
      detached: refreshMergedNode(detached),
    };
  }

  for (const child of root.children) {
    const result = detachNode(child, targetId);
    if (!result) continue;
    const children = root.children.map((current) =>
      current.id === child.id ? result.remaining : current,
    );
    const rebuilt = refreshMergedNode({
      ...root,
      children,
      headChildId:
        root.headChildId === child.id ? result.remaining.id : root.headChildId,
    });
    return { remaining: rebuilt, detached: result.detached };
  }

  return null;
}

function buildTreeLayout(node: SyntaxNode, width: number): TreeLayoutNode[] {
  const result: TreeLayoutNode[] = [];

  function visit(
    current: SyntaxNode,
    centerX: number,
    depth: number,
    parentX?: number,
    parentY?: number,
    inheritedIllFormed = false,
  ) {
    const centerY = depth * LEVEL_HEIGHT + 24;
    const isIllFormed = inheritedIllFormed || Boolean(current.illFormed);

    result.push({
      node: current,
      x: centerX,
      y: centerY,
      parentX,
      parentY,
      inheritedIllFormed: isIllFormed,
    });

    if (current.children?.length === 2) {
      const [left, right] = current.children;
      const childOffset =
        (getTreeHalfWidth(left) + getTreeHalfWidth(right)) / 2 + SIBLING_GAP;
      current.children.forEach((child, index) => {
        visit(
          child,
          centerX + (index === 0 ? -childOffset : childOffset),
          depth + 1,
          centerX,
          centerY,
          isIllFormed,
        );
      });
    }
  }

  visit(node, width / 2, 0);
  return result;
}

function FeatureList({ node }: { node: SyntaxNode }) {
  return (
    <span className="feature-list" aria-label="feature list">
      [
      {node.features.map((feature, index) => (
        <span key={`${feature.value}-${index}`}>
          {index > 0 ? ", " : ""}
          <span className={feature.checked ? "feature-checked" : undefined}>
            {feature.value}
          </span>
        </span>
      ))}
      ]
    </span>
  );
}

function TreeNodeContent({
  node,
  illFormed,
}: {
  node: SyntaxNode;
  illFormed: boolean;
}) {
  if (node.type === "merged") {
    return (
      <div className={`mother-label ${illFormed ? "ill-formed" : ""}`}>
        {node.label}
      </div>
    );
  }

  return (
    <div className={`lexical-label ${illFormed ? "ill-formed" : ""}`}>
      <span className="spelling">{node.spelling}</span>{" "}
      <FeatureList node={node} />
    </div>
  );
}

function SyntaxTree({
  node,
  onDetach,
}: {
  node: SyntaxNode;
  onDetach: (nodeId: string) => void;
}) {
  const size = getNodeSize(node);
  const layout = buildTreeLayout(node, size.width);
  const rootChildIds = new Set(node.children?.map((child) => child.id) ?? []);

  return (
    <svg
      className="syntax-tree"
      width={size.width}
      height={size.height}
      viewBox={`0 0 ${size.width} ${size.height}`}
      role="img"
      aria-label={`${node.label ?? node.spelling} syntax tree`}
    >
      {layout.map(
        (item) =>
          item.parentX !== undefined &&
          item.parentY !== undefined && (
            <line
              key={`line-${item.node.id}`}
              x1={item.parentX}
              y1={item.parentY + 18}
              x2={item.x}
              y2={item.y - 18}
              className={item.inheritedIllFormed ? "tree-line ill" : "tree-line"}
            />
          ),
      )}
      {layout.map((item) => (
        <foreignObject
          key={item.node.id}
          x={item.x - LEAF_WIDTH / 2}
          y={item.y - 22}
          width={LEAF_WIDTH}
          height={48}
        >
          <TreeNodeContent
            node={item.node}
            illFormed={item.inheritedIllFormed}
          />
        </foreignObject>
      ))}
      {layout.map((item) => {
        const isLeaf = !item.node.children?.length;
        const canDetach =
          item.node.id !== node.id &&
          (isLeaf || rootChildIds.has(item.node.id));
        if (!canDetach) return null;

        return (
          <foreignObject
            key={`detach-${item.node.id}`}
            className="detach-control"
            x={item.x + 44}
            y={item.y - 16}
            width={28}
            height={28}
          >
            <button
              type="button"
              aria-label={`Detach ${item.node.label ?? item.node.spelling}`}
              title="Detach"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onDetach(item.node.id);
              }}
            >
              <CrossIcon />
            </button>
          </foreignObject>
        );
      })}
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 3v14M3 10h14" />
    </svg>
  );
}

export default function MergeWorkspace() {
  const [nodes, setNodes] = useState<SyntaxNode[]>(initialNodes);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [spelling, setSpelling] = useState("");
  const [category, setCategory] = useState<Category>("N");
  const [extraFeatures, setExtraFeatures] = useState<
    UninterpretableFeature[]
  >([]);
  const [message, setMessage] = useState<string | null>(null);
  const [mergeCandidate, setMergeCandidate] =
    useState<MergeCandidate | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes);
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [message]);

  function updateNodes(next: SyntaxNode[]) {
    nodesRef.current = next;
    setNodes(next);
  }

  function handlePointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
    node: SyntaxNode,
  ) {
    if (!canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    dragRef.current = {
      id: node.id,
      pointerId: event.pointerId,
      offsetX: event.clientX - canvasRect.left - node.x,
      offsetY: event.clientY - canvasRect.top - node.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add("dragging");
    setMergeCandidate(null);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !canvasRef.current) {
      return;
    }

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const movingNode = nodesRef.current.find((node) => node.id === drag.id);
    if (!movingNode) return;
    const size = getNodeSize(movingNode);
    const x = Math.max(
      8,
      Math.min(
        event.clientX - canvasRect.left - drag.offsetX,
        canvasRect.width - size.width - 8,
      ),
    );
    const y = Math.max(
      70,
      Math.min(
        event.clientY - canvasRect.top - drag.offsetY,
        canvasRect.height - size.height - 8,
      ),
    );
    const nextNodes = nodesRef.current.map((node) =>
      node.id === drag.id ? { ...node, x, y } : node,
    );
    updateNodes(nextNodes);
    const nextMovingNode = nextNodes.find((node) => node.id === drag.id);
    setMergeCandidate(
      nextMovingNode ? findMergeCandidate(nextNodes, nextMovingNode) : null,
    );
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.currentTarget.classList.remove("dragging");
    const currentNodes = nodesRef.current;
    const moving = currentNodes.find((node) => node.id === drag.id);
    dragRef.current = null;
    setMergeCandidate(null);
    if (!moving) return;

    const candidate = findMergeCandidate(currentNodes, moving);
    const target = candidate?.node;

    if (!target) return;

    const mergeResult = createMerge(moving, target);

    if (!mergeResult) {
      setMessage(
        `No feature can be checked between ${moving.label ?? moving.spelling} and ${target.label ?? target.spelling}.`,
      );
      return;
    }

    const merged = positionMergedFromStationaryDaughter(mergeResult, target);
    updateNodes([
      ...currentNodes.filter(
        (node) => node.id !== moving.id && node.id !== target.id,
      ),
      merged,
    ]);
    setMessage(`${merged.label}: Merge successful`);
  }

  function handleDetach(root: SyntaxNode, targetId: string) {
    const result = detachNode(root, targetId);
    if (!result) return;

    const detachedSize = getNodeSize(result.detached);
    result.remaining.x = root.x;
    result.remaining.y = root.y;
    result.detached.x = root.x + getNodeSize(result.remaining).width + 36;
    result.detached.y = Math.min(
      root.y + 52,
      (canvasRef.current?.clientHeight ?? 900) - detachedSize.height - 8,
    );

    if (canvasRef.current) {
      result.detached.x = Math.max(
        8,
        Math.min(
          result.detached.x,
          canvasRef.current.clientWidth - detachedSize.width - 8,
        ),
      );
    }

    updateNodes([
      ...nodesRef.current.filter((node) => node.id !== root.id),
      result.remaining,
      result.detached,
    ]);
    setMergeCandidate(null);
    setMessage("Expression detached. The associated feature check was undone.");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedSpelling = spelling.trim();
    if (!trimmedSpelling) return;

    const offset = nodesRef.current.length * 22;
    const newNode: SyntaxNode = {
      id: crypto.randomUUID(),
      type: "lexical",
      spelling: trimmedSpelling,
      category,
      features: [
        { value: category, checked: false },
        ...extraFeatures.map((value) => ({ value, checked: false })),
      ],
      x: 100 + (offset % 440),
      y: 140 + (offset % 260),
    };
    updateNodes([...nodesRef.current, newNode]);
    setSpelling("");
    setCategory("N");
    setExtraFeatures([]);
    setIsModalOpen(false);
  }

  return (
    <main className="merge-app">
      <div
        ref={canvasRef}
        className="canvas"
        onPointerMove={handlePointerMove}
        aria-label="Merge canvas"
      >
        <header className="app-header">
          <div>
            <p className="eyebrow">MINIMALIST PROGRAM</p>
            <h1>Merge Lab</h1>
          </div>
          <p className="instruction">
            Drag to Merge. Hover over a leaf or root daughter to detach it.
          </p>
        </header>

        {nodes.map((node) => (
          <div
            key={node.id}
            className="draggable-node"
            style={{ left: node.x, top: node.y }}
            onPointerDown={(event) => handlePointerDown(event, node)}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <SyntaxTree
              node={node}
              onDetach={(targetId) => handleDetach(node, targetId)}
            />
          </div>
        ))}

        {mergeCandidate?.isValid && (
          <div
            className="merge-zone"
            style={{
              left:
                mergeCandidate.node.x +
                getNodeSize(mergeCandidate.node).width / 2,
              top: mergeCandidate.node.y + 24,
            }}
            aria-hidden="true"
          />
        )}

        {mergeCandidate?.isValid && (
          <div className="merge-feedback" role="status">
            Release to Merge
          </div>
        )}

        {message && (
          <div className="status-message" role="status">
            {message}
          </div>
        )}

        <button
          className="add-button"
          type="button"
          onClick={() => setIsModalOpen(true)}
          aria-label="Add lexical item"
        >
          <PlusIcon />
        </button>
      </div>

      {isModalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setIsModalOpen(false);
          }}
        >
          <section
            className="lexical-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-item-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">LEXICON</p>
                <h2 id="new-item-title">New lexical item</h2>
              </div>
              <button
                className="close-button"
                type="button"
                onClick={() => setIsModalOpen(false)}
                aria-label="Close"
              >
                <CrossIcon />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <label className="field">
                <span>Spelling</span>
                <input
                  value={spelling}
                  onChange={(event) => setSpelling(event.target.value)}
                  placeholder="e.g. letters"
                  autoFocus
                  required
                />
              </label>

              <fieldset className="field">
                <legend>Category feature</legend>
                <div className="option-row">
                  {CATEGORIES.map((value) => (
                    <label
                      className={`category-option ${
                        category === value ? "selected" : ""
                      }`}
                      key={value}
                    >
                      <input
                        type="radio"
                        name="category"
                        value={value}
                        checked={category === value}
                        onChange={() => setCategory(value)}
                      />
                      {value}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="field">
                <legend>c-selectional / uninterpretable features</legend>
                <div className="feature-builder">
                  {UNINTERPRETABLE_FEATURES.map((value) => (
                    <button
                      type="button"
                      className="feature-add"
                      key={value}
                      onClick={() =>
                        setExtraFeatures((current) => [...current, value])
                      }
                    >
                      + {value}
                    </button>
                  ))}
                </div>
                <div className="selected-features">
                  {extraFeatures.length === 0 ? (
                    <span className="empty-features">Optional</span>
                  ) : (
                    extraFeatures.map((value, index) => (
                      <button
                        type="button"
                        className="feature-chip"
                        key={`${value}-${index}`}
                        onClick={() =>
                          setExtraFeatures((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                        aria-label={`Remove ${value}`}
                      >
                        {value} <span>×</span>
                      </button>
                    ))
                  )}
                </div>
              </fieldset>

              <div className="preview">
                <span>Preview</span>
                <strong>
                  {spelling.trim() || "item"} [{category}
                  {extraFeatures.map((feature) => `, ${feature}`)}]
                </strong>
              </div>

              <button className="create-button" type="submit">
                Add to canvas
              </button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
