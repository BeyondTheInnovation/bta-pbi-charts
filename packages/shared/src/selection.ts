"use strict";

import powerbi from "powerbi-visuals-api";
import ISelectionId = powerbi.extensibility.ISelectionId;
import ISelectionManager = powerbi.extensibility.ISelectionManager;

export interface SelectionBindingOptions {
    root: HTMLElement;
    selectionManager: ISelectionManager;
    markSelector: string;
    selectionIdsByKey: Map<string, ISelectionId>;
    dataKeyAttr?: string;
    dimOpacity?: number;
    selectedOpacity?: number;
    matchByIncludes?: boolean;
    preserveOpacityWhenNoMatches?: boolean;
}

export function getSelectionIdentityKey(selectionId: ISelectionId): string {
    const anySelectionId = selectionId as any;
    if (typeof anySelectionId?.getKey === "function") {
        return String(anySelectionId.getKey());
    }
    if (typeof anySelectionId?.getSelector === "function") {
        try {
            return JSON.stringify(anySelectionId.getSelector());
        } catch {
            // ignore and use fallback
        }
    }
    return String(anySelectionId);
}

function stableStringify(value: any): string {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    }

    const keys = Object.keys(value).sort();
    const props = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${props.join(",")}}`;
}

function getSelectionSelectorKey(selectionId: ISelectionId): string | null {
    const anySelectionId = selectionId as any;
    if (typeof anySelectionId?.getSelector !== "function") {
        return null;
    }

    try {
        const selector = anySelectionId.getSelector();
        return stableStringify(selector);
    } catch {
        return null;
    }
}

export function bindSelectionByDataKey(options: SelectionBindingOptions): {
    applySelection: (ids: ISelectionId[]) => void;
} {
    const dataKeyAttr = options.dataKeyAttr ?? "data-selection-key";
    const dimOpacity = options.dimOpacity ?? 0.25;
    const selectedOpacity = options.selectedOpacity ?? 1;
    const matchByIncludes = options.matchByIncludes ?? true;
    const preserveOpacityWhenNoMatches = options.preserveOpacityWhenNoMatches ?? false;

    const selectionIdsMatch = (left: ISelectionId, right: ISelectionId): boolean => {
        // Use the canonical Power BI equals() method first — it handles cross-visual scope matching.
        try {
            if ((left as any).equals?.(right)) {
                return true;
            }
        } catch {
            // equals() may not be available on all runtime objects
        }

        const leftKey = getSelectionIdentityKey(left);
        const rightKey = getSelectionIdentityKey(right);
        if (leftKey === rightKey) return true;

        const leftSelectorKey = getSelectionSelectorKey(left);
        const rightSelectorKey = getSelectionSelectorKey(right);
        if (leftSelectorKey && rightSelectorKey) {
            return leftSelectorKey === rightSelectorKey;
        }

        if (matchByIncludes) {
            const leftAny = left as any;
            const rightAny = right as any;
            const leftIncludesRight = typeof leftAny?.includes === "function" ? Boolean(leftAny.includes(right)) : false;
            const rightIncludesLeft = typeof rightAny?.includes === "function" ? Boolean(rightAny.includes(left)) : false;
            return leftIncludesRight || rightIncludesLeft;
        }

        return false;
    };

    const getSelectedKeys = (ids: ISelectionId[]): Set<string> => {
        if (!ids || ids.length === 0) return new Set<string>();
        const selectedDataKeys = new Set<string>();
        options.selectionIdsByKey.forEach((selectionId, dataKey) => {
            if (ids.some((selectedId) => selectionIdsMatch(selectedId, selectionId))) {
                selectedDataKeys.add(dataKey);
            }
        });
        return selectedDataKeys;
    };

    const applySelection = (ids: ISelectionId[]): void => {
        const selectedKeys = getSelectedKeys(ids);
        if (preserveOpacityWhenNoMatches && (ids?.length ?? 0) > 0 && selectedKeys.size === 0) {
            return;
        }
        const marks = options.root.querySelectorAll<SVGElement>(options.markSelector);
        marks.forEach(mark => {
            const dataKey = mark.getAttribute(dataKeyAttr);
            if (!dataKey) {
                mark.style.opacity = "";
                return;
            }
            mark.style.opacity = selectedKeys.size === 0
                ? ""
                : (selectedKeys.has(dataKey) ? String(selectedOpacity) : String(dimOpacity));
        });
    };

    const marks = options.root.querySelectorAll<SVGElement>(options.markSelector);
    marks.forEach(mark => {
        const dataKey = mark.getAttribute(dataKeyAttr);
        if (!dataKey) return;

        const selectionId = options.selectionIdsByKey.get(dataKey);
        if (!selectionId) return;

        mark.style.cursor = "pointer";

        mark.addEventListener("click", (event: MouseEvent) => {
            event.stopPropagation();
            const isMultiSelect = event.ctrlKey || event.metaKey;
            options.selectionManager
                .select(selectionId, isMultiSelect)
                .then(ids => applySelection(ids))
                .catch(() => undefined);
        });

        mark.addEventListener("contextmenu", (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            options.selectionManager
                .showContextMenu(selectionId, { x: event.clientX, y: event.clientY })
                .catch(() => undefined);
        });
    });

    return { applySelection };
}
