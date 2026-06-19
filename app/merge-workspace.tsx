"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

type Category = "N" | "V" | "v" | "A" | "P";
type UninterpretableFeature = `u${Category}`;
type FeatureKind = "category" | "c-selectional" | "other";
type Linearization = "head-initial" | "head-final";
type IllFormedReason = "unchecked-non-head" | "hierarchy-of-projection";
type MergeRelation = "complement" | "specifier";

type Feature = {
  value: string;
  checked: boolean;
  interpretable: boolean;
  kind: FeatureKind;
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
  violationsIntroduced?: IllFormedReason[];
  mergeRelation?: MergeRelation;
  x: number;
  y: number;
  illFormed?: boolean;
  illFormedReasons?: IllFormedReason[];
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
  radius: number;
};

type DeletedNode = {
  node: SyntaxNode;
  index: number;
};

type MergeResult = {
  node: SyntaxNode;
  warnings: string[];
};

const CATEGORIES: Category[] = ["N", "V", "v", "A", "P"];
const UNINTERPRETABLE_FEATURES: UninterpretableFeature[] = [
  "uN",
  "uV",
  "uv",
  "uA",
  "uP",
];
const LEVEL_HEIGHT = 78;
// Keep only enough space between sister subtrees for one 24px detach control.
const DETACH_GAP = 28;
const MIN_LABEL_WIDTH = 54;
const MAX_LABEL_WIDTH = 240;
const TRASH_ZONE_SIZE = 76;
const TRASH_ZONE_MARGIN = 28;

const initialNodes: SyntaxNode[] = [
  {
    id: "letters",
    type: "lexical",
    spelling: "letters",
    category: "N",
    features: [
      {
        value: "N",
        checked: false,
        interpretable: true,
        kind: "category",
      },
      {
        value: "uP",
        checked: false,
        interpretable: false,
        kind: "c-selectional",
      },
    ],
    x: 140,
    y: 220,
  },
  {
    id: "to",
    type: "lexical",
    spelling: "to",
    category: "P",
    features: [
      {
        value: "P",
        checked: false,
        interpretable: true,
        kind: "category",
      },
      {
        value: "uN",
        checked: false,
        interpretable: false,
        kind: "c-selectional",
      },
    ],
    x: 390,
    y: 220,
  },
  {
    id: "peter",
    type: "lexical",
    spelling: "Peter",
    category: "N",
    features: [
      {
        value: "N",
        checked: false,
        interpretable: true,
        kind: "category",
      },
    ],
    x: 640,
    y: 220,
  },
];

function treeDepth(node: SyntaxNode): number {
  if (!node.children?.length) return 1;
  return 1 + Math.max(...node.children.map(treeDepth));
}

function getNodeLabelWidth(node: SyntaxNode): number {
  if (node.type === "merged") {
    return Math.max(MIN_LABEL_WIDTH, (node.label?.length ?? 2) * 11 + 18);
  }

  const featureText = node.features.map((feature) => feature.value).join(", ");
  const text = `${node.spelling ?? ""} [${featureText}]`;
  return Math.min(
    MAX_LABEL_WIDTH,
    Math.max(MIN_LABEL_WIDTH, text.length * 7.4 + 18),
  );
}

function getTreeHalfWidth(node: SyntaxNode): number {
  const labelHalf = getNodeLabelWidth(node) / 2;
  if (!node.children?.length) return labelHalf;
  const [left, right] = node.children;
  const leftHalf = getTreeHalfWidth(left);
  const rightHalf = getTreeHalfWidth(right);
  const childOffset = (leftHalf + rightHalf + DETACH_GAP) / 2;
  return Math.max(
    labelHalf,
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

function isActiveUninterpretableFeature(feature: Feature) {
  return !feature.interpretable && !feature.checked;
}

function hasUncheckedFeature(node: SyntaxNode) {
  return node.features.some(
    isActiveUninterpretableFeature,
  );
}

function hasUncheckedCSelectionalFeature(node: SyntaxNode) {
  return node.features.some(
    (feature) =>
      feature.kind === "c-selectional" &&
      !feature.interpretable &&
      !feature.checked,
  );
}

function subtreeHasUncheckedFeature(node: SyntaxNode): boolean {
  if (hasUncheckedFeature(node)) return true;
  return node.children?.some(subtreeHasUncheckedFeature) ?? false;
}

function getActiveUninterpretableFeatures(node: SyntaxNode): Feature[] {
  // Merged nodes project their head's features, so inspect lexical leaves to
  // avoid counting the same projected feature more than once.
  if (node.type === "lexical" || !node.children?.length) {
    return node.features.filter(isActiveUninterpretableFeature);
  }
  return node.children.flatMap(getActiveUninterpretableFeatures);
}

function getActiveCSelectionalFeatures(node: SyntaxNode): Feature[] {
  return getActiveUninterpretableFeatures(node).filter(
    (feature) => feature.kind === "c-selectional",
  );
}

function markIllFormed(
  node: SyntaxNode,
  reason: IllFormedReason,
): SyntaxNode {
  return {
    ...node,
    illFormed: true,
    illFormedReasons: Array.from(
      new Set([...(node.illFormedReasons ?? []), reason]),
    ),
  };
}

function clearIllFormedReason(
  node: SyntaxNode,
  reason: IllFormedReason,
): SyntaxNode {
  const reasons = (node.illFormedReasons ?? []).filter(
    (current) => current !== reason,
  );
  return {
    ...node,
    illFormed: reasons.length > 0,
    illFormedReasons: reasons,
  };
}

function hasVPComplement(node: SyntaxNode): boolean {
  if (node.category !== "v" || !node.children || !node.headChildId) {
    return false;
  }

  const nonHead = node.children.find((child) => child.id !== node.headChildId);
  if (nonHead?.category === "V") return true;

  const head = node.children.find((child) => child.id === node.headChildId);
  return head ? hasVPComplement(head) : false;
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
    (feature) =>
      feature.kind === "c-selectional" &&
      !feature.interpretable &&
      feature.value === expected &&
      !feature.checked,
  );
  return match ? expected : null;
}

function isHierarchyOfProjectionMerge(
  possibleHead: SyntaxNode,
  complement: SyntaxNode,
) {
  return (
    possibleHead.category === "v" &&
    complement.category === "V" &&
    !hasVPComplement(possibleHead)
  );
}

function classifyMergeRelation(head: SyntaxNode): MergeRelation {
  // The first Merge with a lexical head introduces its complement.
  // Any later Merge targets an already projected head and introduces a specifier.
  return head.type === "lexical" ? "complement" : "specifier";
}

function createMerge(
  first: SyntaxNode,
  second: SyntaxNode,
  linearization: Linearization,
): MergeResult | null {
  // The moving item is considered first only to resolve the rare case where
  // both daughters can select each other; either direction is otherwise valid.
  const firstMatch = findHeadCandidate(first, second);
  const secondMatch = findHeadCandidate(second, first);
  const hierarchyHead = isHierarchyOfProjectionMerge(first, second)
    ? first
    : isHierarchyOfProjectionMerge(second, first)
      ? second
      : null;
  const head = firstMatch ? first : secondMatch ? second : hierarchyHead;
  const checkedValue = firstMatch ?? secondMatch;

  if (!head) return null;

  const nonHead = head.id === first.id ? second : first;
  const isHierarchyMerge = hierarchyHead?.id === head.id && !checkedValue;
  const mergeRelation = classifyMergeRelation(head);
  const activeNonHeadSelection = getActiveCSelectionalFeatures(nonHead);
  const violatesHierarchy =
    head.category === "v" &&
    !isHierarchyMerge &&
    checkedValue !== "uV" &&
    !hasVPComplement(head);
  const checkedHeadBase = checkedValue
    ? checkHeadFeature(head, checkedValue)
    : head;
  const checkedHead = violatesHierarchy
    ? markIllFormed(checkedHeadBase, "hierarchy-of-projection")
    : checkedHeadBase;
  const markedNonHead = subtreeHasUncheckedFeature(nonHead)
    ? markIllFormed(nonHead, "unchecked-non-head")
    : nonHead;
  const label = hasUncheckedCSelectionalFeature(checkedHead)
    ? `${checkedHead.category}′`
    : `${checkedHead.category}P`;
  // Head Initial places complements to the right and specifiers to the left.
  // Head Final reverses both. Projection status, not checking history,
  // determines which relation the new non-head bears.
  const nonHeadGoesRight =
    linearization === "head-initial"
      ? mergeRelation === "complement"
      : mergeRelation === "specifier";
  const children = nonHeadGoesRight
    ? [checkedHead, markedNonHead]
    : [markedNonHead, checkedHead];

  const warnings: string[] = [];
  if (activeNonHeadSelection.length > 0) {
    warnings.push(
      `Non-head warning: unchecked c-selectional feature(s) remain: ${activeNonHeadSelection
        .map((feature) => feature.value)
        .join(", ")}.`,
    );
  }
  if (violatesHierarchy) {
    warnings.push(
      "Hierarchy of Projection warning: v must merge with a VP complement before another c-selectional feature is checked.",
    );
  }

  return {
    node: {
      id: crypto.randomUUID(),
      type: "merged",
      category: checkedHead.category,
      // A merged node projects the head's features for later Merge operations.
      features: checkedHead.features.map((feature) => ({ ...feature })),
      label,
      children,
      headChildId: checkedHead.id,
      checkedFeature: checkedValue ?? undefined,
      mergeRelation,
      violationsIntroduced: violatesHierarchy
        ? ["hierarchy-of-projection"]
        : [],
      x: 0,
      y: 0,
    },
    warnings,
  };
}

function canMerge(first: SyntaxNode, second: SyntaxNode) {
  return Boolean(
    findHeadCandidate(first, second) ||
      findHeadCandidate(second, first) ||
      isHierarchyOfProjectionMerge(first, second) ||
      isHierarchyOfProjectionMerge(second, first),
  );
}

function getMergeRadius(first: SyntaxNode, second: SyntaxNode) {
  // This equals the distance between the two daughter roots after Merge.
  return (
    getTreeHalfWidth(first) +
    getTreeHalfWidth(second) +
    DETACH_GAP
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
      const radius = getMergeRadius(moving, node);
      return { node, distance, radius };
    })
    .filter((candidate) => candidate.distance <= candidate.radius)
    .sort((a, b) => a.distance - b.distance)[0]?.node;

  return target
    ? {
        node: target,
        isValid: canMerge(moving, target),
        radius: getMergeRadius(moving, target),
      }
    : null;
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
  const reasons = (node.illFormedReasons ?? []).filter(
    (reason) => reason !== "unchecked-non-head",
  );
  return {
    ...node,
    illFormed: reasons.length > 0,
    illFormedReasons: reasons,
  };
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
      ? markIllFormed(child, "unchecked-non-head")
      : clearRootIllFormed(child),
  );

  return {
    ...node,
    category: head.category,
    features: head.features.map((feature) => ({ ...feature })),
    label: hasUncheckedCSelectionalFeature(head)
      ? `${head.category}′`
      : `${head.category}P`,
    children,
    illFormed: node.illFormedReasons?.includes("hierarchy-of-projection"),
    illFormedReasons: node.illFormedReasons?.filter(
      (reason) => reason === "hierarchy-of-projection",
    ),
  };
}

function detachNode(
  root: SyntaxNode,
  targetId: string,
): { remaining: SyntaxNode; detached: SyntaxNode } | null {
  if (!root.children || !root.headChildId) return null;
  const directIndex = root.children.findIndex((child) => child.id === targetId);

  if (directIndex < 0) return null;

  const selected = clearRootIllFormed(root.children[directIndex]);
  const sibling = root.children[directIndex === 0 ? 1 : 0];
  let detached =
    selected.id === root.headChildId && root.checkedFeature
      ? uncheckHeadFeature(selected, root.checkedFeature)
      : selected;
  let remaining =
    sibling.id === root.headChildId && root.checkedFeature
      ? uncheckHeadFeature(sibling, root.checkedFeature)
      : sibling;
  if (
    root.violationsIntroduced?.includes("hierarchy-of-projection")
  ) {
    if (sibling.id === root.headChildId) {
      remaining = clearIllFormedReason(
        remaining,
        "hierarchy-of-projection",
      );
    }
    if (selected.id === root.headChildId) {
      detached = clearIllFormedReason(detached, "hierarchy-of-projection");
    }
  }
  return {
    remaining: refreshMergedNode(clearRootIllFormed(remaining)),
    detached: refreshMergedNode(detached),
  };
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
        (getTreeHalfWidth(left) + getTreeHalfWidth(right) + DETACH_GAP) / 2;
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
      {layout.map((item) => {
        const labelWidth = getNodeLabelWidth(item.node);
        const canDetach = rootChildIds.has(item.node.id);
        return (
          <foreignObject
            key={item.node.id}
            x={item.x - labelWidth / 2}
            y={item.y - 22}
            width={labelWidth + (canDetach ? 32 : 0)}
            height={48}
            className={canDetach ? "detachable-label" : undefined}
          >
            <div className="node-label-row">
              <div style={{ width: labelWidth }}>
                <TreeNodeContent
                  node={item.node}
                  illFormed={item.inheritedIllFormed}
                />
              </div>
              {canDetach && (
                <button
                  className="detach-control"
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
              )}
            </div>
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

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 4h10M6 2.5h4M5 6v6M8 6v6M11 6v6M4 4l.6 9.5h6.8L12 4" />
    </svg>
  );
}

export default function MergeWorkspace() {
  const [nodes, setNodes] = useState<SyntaxNode[]>(initialNodes);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Kept as an explicit internal option so Head Final can be exposed later.
  const linearization: Linearization = "head-initial";
  const [spelling, setSpelling] = useState("");
  const [category, setCategory] = useState<Category>("N");
  const [extraFeatures, setExtraFeatures] = useState<
    UninterpretableFeature[]
  >([]);
  const [message, setMessage] = useState<string | null>(null);
  const [lastDeleted, setLastDeleted] = useState<DeletedNode | null>(null);
  const [mergeCandidate, setMergeCandidate] =
    useState<MergeCandidate | null>(null);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [isOverTrash, setIsOverTrash] = useState(false);
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
    const isDeleteMessage =
      lastDeleted &&
      message ===
        `${lastDeleted.node.label ?? lastDeleted.node.spelling} removed from the canvas.`;
    const timeout = window.setTimeout(() => {
      setMessage(null);
      setLastDeleted(null);
    }, isDeleteMessage || message.includes("warning:") ? 6000 : 2200);
    return () => window.clearTimeout(timeout);
  }, [lastDeleted, message]);

  function updateNodes(next: SyntaxNode[]) {
    nodesRef.current = next;
    setNodes(next);
  }

  function isPointerOverTrash(clientX: number, clientY: number) {
    if (!canvasRef.current) return false;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const x = clientX - canvasRect.left;
    const y = clientY - canvasRect.top;
    return (
      x >= canvasRect.width - TRASH_ZONE_MARGIN - TRASH_ZONE_SIZE &&
      x <= canvasRect.width - TRASH_ZONE_MARGIN &&
      y >= canvasRect.height - TRASH_ZONE_MARGIN - TRASH_ZONE_SIZE &&
      y <= canvasRect.height - TRASH_ZONE_MARGIN
    );
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
    setDraggingNodeId(node.id);
    setIsOverTrash(false);
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
    const overTrash = isPointerOverTrash(event.clientX, event.clientY);
    setIsOverTrash(overTrash);
    setMergeCandidate(
      !overTrash && nextMovingNode
        ? findMergeCandidate(nextNodes, nextMovingNode)
        : null,
    );
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.currentTarget.classList.remove("dragging");
    const currentNodes = nodesRef.current;
    const moving = currentNodes.find((node) => node.id === drag.id);
    const droppedOnTrash = isPointerOverTrash(event.clientX, event.clientY);
    dragRef.current = null;
    setDraggingNodeId(null);
    setIsOverTrash(false);
    setMergeCandidate(null);
    if (!moving) return;

    if (droppedOnTrash) {
      handleDelete(moving.id);
      return;
    }

    const candidate = findMergeCandidate(currentNodes, moving);
    const target = candidate?.node;

    if (!target) return;

    const mergeResult = createMerge(moving, target, linearization);

    if (!mergeResult) {
      setMessage(
        `No feature can be checked between ${moving.label ?? moving.spelling} and ${target.label ?? target.spelling}.`,
      );
      return;
    }

    const merged = positionMergedFromStationaryDaughter(
      mergeResult.node,
      target,
    );
    updateNodes([
      ...currentNodes.filter(
        (node) => node.id !== moving.id && node.id !== target.id,
      ),
      merged,
    ]);
    setMessage(
      mergeResult.warnings.length > 0
        ? mergeResult.warnings.join(" ")
        : `${merged.label}: Merge successful`,
    );
  }

  function handleDetach(root: SyntaxNode, targetId: string) {
    const originalSize = getNodeSize(root);
    const originalPositions = new Map(
      buildTreeLayout(root, originalSize.width).map((item) => [
        item.node.id,
        {
          x: root.x + item.x,
          y: root.y + item.y,
        },
      ]),
    );
    const result = detachNode(root, targetId);
    if (!result) return;

    const remainingPosition = originalPositions.get(result.remaining.id);
    const detachedPosition = originalPositions.get(result.detached.id);
    if (!remainingPosition || !detachedPosition) return;

    const remainingSize = getNodeSize(result.remaining);
    const detachedSize = getNodeSize(result.detached);

    // Preserve both resulting roots at their exact pre-detach canvas points.
    result.remaining.x = remainingPosition.x - remainingSize.width / 2;
    result.remaining.y = remainingPosition.y - 24;
    result.detached.x = detachedPosition.x - detachedSize.width / 2;
    result.detached.y = detachedPosition.y - 24;

    updateNodes([
      ...nodesRef.current.filter((node) => node.id !== root.id),
      result.remaining,
      result.detached,
    ]);
    setMergeCandidate(null);
    setMessage("Expression detached. The associated feature check was undone.");
  }

  function handleDelete(nodeId: string) {
    const index = nodesRef.current.findIndex((item) => item.id === nodeId);
    if (index < 0) return;
    const node = nodesRef.current[index];
    setLastDeleted({ node, index });
    updateNodes(nodesRef.current.filter((item) => item.id !== nodeId));
    setMergeCandidate(null);
    setMessage(`${node.label ?? node.spelling} removed from the canvas.`);
  }

  function handleUndoDelete() {
    if (!lastDeleted) return;
    const nextNodes = [...nodesRef.current];
    nextNodes.splice(
      Math.min(lastDeleted.index, nextNodes.length),
      0,
      lastDeleted.node,
    );
    updateNodes(nextNodes);
    setLastDeleted(null);
    setMessage(null);
  }

  const canUndoDelete =
    lastDeleted &&
    message ===
      `${lastDeleted.node.label ?? lastDeleted.node.spelling} removed from the canvas.`;

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
        {
          value: category,
          checked: false,
          interpretable: true,
          kind: "category" as const,
        },
        ...extraFeatures.map((value) => ({
          value,
          checked: false,
          interpretable: false,
          kind: "c-selectional" as const,
        })),
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
            Drag to Merge. Hover over a root daughter to detach it.
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
            {(() => {
              const activeFeatures = getActiveUninterpretableFeatures(node);
              const hasFullInterpretation = activeFeatures.length === 0;
              return (
                <div
                  className={`interpretation-status ${
                    hasFullInterpretation ? "complete" : "incomplete"
                  }`}
                  style={{ top: getNodeSize(node).height + 4 }}
                  title={
                    hasFullInterpretation
                      ? "No active uninterpretable features remain."
                      : "Active uninterpretable features remain in this structure."
                  }
                >
                  {hasFullInterpretation
                    ? "Full Interpretation"
                    : `Uninterpretable: ${activeFeatures
                        .map((feature) => feature.value)
                        .join(", ")}`}
                </div>
              );
            })()}
          </div>
        ))}

        {draggingNodeId && (
          <div
            className={`trash-drop-zone ${isOverTrash ? "active" : ""}`}
            aria-label="Drop here to remove from canvas"
          >
            <TrashIcon />
            <span>{isOverTrash ? "Release to remove" : "Remove"}</span>
          </div>
        )}

        {mergeCandidate?.isValid && (
          <div
            className="merge-zone"
            style={{
              left:
                mergeCandidate.node.x +
                getNodeSize(mergeCandidate.node).width / 2,
              top: mergeCandidate.node.y + 24,
              width: mergeCandidate.radius * 2,
              height: mergeCandidate.radius * 2,
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
          <div
            className={`status-message ${
              message.includes("warning:") ? "warning" : ""
            }`}
            role={message.includes("warning:") ? "alert" : "status"}
          >
            <span>{message}</span>
            {canUndoDelete && (
              <button type="button" onClick={handleUndoDelete}>
                Undo
              </button>
            )}
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
