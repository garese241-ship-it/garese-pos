/** @odoo-module */

import { Component, useEffect, useRef, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { SelectionPopup } from "@point_of_sale/app/utils/input_popups/selection_popup";

// Keep in sync with .gp-cat-tile in garese_pos.scss
const TILE_MIN_WIDTH = 104;
const TILE_GAP = 8;

/**
 * Row of category tiles: Home, All, then the top level categories. The tiles
 * that do not fit on the screen are reachable through the "More" tile.
 */
export class GpCategoryBar extends Component {
    static template = "garese_pos.GpCategoryBar";
    static props = {
        tiles: {
            type: Array,
            element: {
                type: Object,
                shape: {
                    id: Number,
                    name: String,
                    count: Number,
                    color: String,
                    icon: String,
                    imageUrl: { type: [String, Boolean], optional: true },
                },
            },
        },
        activeId: Number,
        home: Boolean,
        allCount: Number,
        onHome: Function,
        onSelect: Function,
    };

    setup() {
        this.popup = useService("popup");
        this.root = useRef("root");
        this.state = useState({ slots: 20 });
        useEffect(
            () => {
                const el = this.root.el;
                if (!el) {
                    return;
                }
                const update = () => {
                    const width = el.clientWidth;
                    if (width) {
                        this.state.slots = Math.max(
                            3,
                            Math.floor((width + TILE_GAP) / (TILE_MIN_WIDTH + TILE_GAP))
                        );
                    }
                };
                const observer = new ResizeObserver(update);
                observer.observe(el);
                update();
                return () => observer.disconnect();
            },
            () => []
        );
    }

    /** Number of category tiles that fit next to Home and All. */
    get capacity() {
        const free = this.state.slots - 2;
        return this.props.tiles.length <= free ? free : Math.max(free - 1, 0);
    }
    get visibleTiles() {
        const { tiles, activeId } = this.props;
        const visible = tiles.slice(0, this.capacity);
        // The selected category must stay visible even when it lives in "More".
        const active = tiles.find((tile) => tile.id === activeId);
        if (active && !visible.includes(active) && visible.length) {
            visible[visible.length - 1] = active;
        }
        return visible;
    }
    get hiddenTiles() {
        const visible = this.visibleTiles;
        return this.props.tiles.filter((tile) => !visible.includes(tile));
    }
    countLabel(count) {
        return count === 1 ? _t("1 product") : _t("%s products", count);
    }
    async openMore() {
        const { confirmed, payload } = await this.popup.add(SelectionPopup, {
            title: _t("Categories"),
            list: this.hiddenTiles.map((tile) => ({
                id: tile.id,
                label: `${tile.name} (${tile.count})`,
                isSelected: tile.id === this.props.activeId,
                item: tile.id,
            })),
        });
        if (confirmed) {
            this.props.onSelect(payload);
        }
    }
}
