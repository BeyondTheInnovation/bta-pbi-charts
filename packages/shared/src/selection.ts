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

export function bindSelectionByDataKey(options: SelectionBindingOptions): {
    applySelection: (ids: ISelectionId[]) => void;
} {
    const dataKeyAttr = options.dataKeyAttr ?? "data-selection-key";
    const dimOpacity = options.dimOpacity ?? 0.25;
    const selectedOpacity = options.selectedOpacity ?? 1;

    const getSelectedKeys = (ids: ISelectionId[]): Set<string> => {
        if (!ids || ids.length === 0) return new Set<string>();
        const selectedIdentityKeys = new Set(ids.map(getSelectionIdentityKey));
        const selectedDataKeys = new Set<string>();
        options.selectionIdsByKey.forEach((selectionId, dataKey) => {
            if (selectedIdentityKeys.has(getSelectionIdentityKey(selectionId))) {
                selectedDataKeys.add(dataKey);
            }
        });
        return selectedDataKeys;
    };

    const applySelection = (ids: ISelectionId[]): void => {
        const selectedKeys = getSelectedKeys(ids);
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
