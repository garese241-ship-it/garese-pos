/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { ConfirmPopup } from "@point_of_sale/app/utils/confirm_popup/confirm_popup";
import { GpCalculator } from "@garese_pos/app/calculator/calculator";
import { gpOrderSummary } from "@garese_pos/app/utils/order_summary";

/**
 * Control buttons shown in the left column, next to the numpad (as on the
 * design). Every other control button - including the ones added by other
 * modules - goes to the row under the cart title.
 */
ProductScreen.gpSideButtonNames = ["OrderlineCustomerNoteButton", "SetSaleOrderButton"];

ProductScreen.components = { ...ProductScreen.components, GpCalculator };

patch(ProductScreen.prototype, {
    // ------------------------------------------------------------------
    // Control buttons
    // ------------------------------------------------------------------
    get gpTopControlButtons() {
        const side = this.constructor.gpSideButtonNames;
        const buttons = this.controlButtons.filter((cb) => !side.includes(cb.name));
        // The Loyalty app brings its own "Enter Code" button (coupons, promo
        // codes): two buttons with the same label would confuse cashiers.
        // Manual barcode entry stays available from the search bar.
        if (buttons.some((cb) => cb.name === "PromoCodeButton")) {
            return buttons.filter((cb) => cb.name !== "GpEnterCodeButton");
        }
        return buttons;
    },
    get gpSideControlButtons() {
        const side = this.constructor.gpSideButtonNames;
        return this.controlButtons.filter((cb) => side.includes(cb.name));
    },

    // ------------------------------------------------------------------
    // Cart header
    // ------------------------------------------------------------------
    get gpItemCount() {
        const lines = this.currentOrder?.get_orderlines() || [];
        return lines.filter((line) => !line.comboParent).length;
    },
    get gpItemCountLabel() {
        const count = this.gpItemCount;
        return count === 1 ? _t("1 item") : _t("%s items", count);
    },
    get gpCanClearCart() {
        return Boolean(this.gpItemCount) && !this.pos.disallowLineQuantityChange();
    },
    async gpClearCart() {
        const order = this.currentOrder;
        if (!order || !this.gpCanClearCart) {
            return;
        }
        const { confirmed } = await this.popup.add(ConfirmPopup, {
            title: _t("Empty the cart?"),
            body: _t("All the lines of the current order will be removed."),
            confirmText: _t("Empty"),
        });
        if (!confirmed) {
            return;
        }
        // removeOrderline also drops the children of a combo: always take the
        // first remaining line instead of iterating on a stale list.
        let guard = order.get_orderlines().length + 1;
        while (order.get_orderlines().length && guard-- > 0) {
            order.removeOrderline(order.get_orderlines()[0]);
        }
        this.numberBuffer.reset();
        this.pos.numpadMode = "quantity";
    },

    // ------------------------------------------------------------------
    // Cart lines: picture, +/- and delete
    // ------------------------------------------------------------------
    /**
     * Display data of a line for the Orderline component, enriched with what
     * the GARESE layout needs. Nothing is added on small screens, where the
     * standard mobile layout is kept.
     */
    gpLineData(line) {
        const data = line.getDisplayData();
        if (this.ui.isSmall) {
            return data;
        }
        const product = line.get_product();
        data.gp = {
            imageUrl: (this.pos.show_product_images && product.getImageUrl()) || false,
            // Refunds, combo children, rewards and tips keep their quantity:
            // it is driven by another line or by a business rule.
            canStep: this.gpCanStep(line),
            // The unit of measure only matters for products sold by weight.
            unitLabel: product.to_weight ? data.unit : "",
            qtyLabel: this.gpQuantityLabel(line),
            onPlus: () => this.gpChangeQuantity(line, 1),
            onMinus: () => this.gpChangeQuantity(line, -1),
            onRemove: () => this.gpRemoveLine(line),
        };
        return data;
    },
    gpCanStep(line) {
        return !(
            line.comboParent ||
            line.refunded_orderline_id ||
            line.is_reward_line ||
            line.isTipLine() ||
            line.get_quantity() < 0
        );
    },
    /** "2" rather than "2,00" for whole quantities, as on the design. */
    gpQuantityLabel(line) {
        const quantity = line.get_quantity();
        return Number.isInteger(quantity) ? String(quantity) : line.get_quantity_str();
    },
    gpFormatQuantity(quantity) {
        const decimals = this.pos.dp["Product Unit of Measure"] ?? 3;
        const rounded = Number(quantity.toFixed(decimals));
        // The numpad pipeline expects what a user would have typed.
        return String(rounded).replace(".", this.env.services.localization.decimalPoint);
    },
    /**
     * +/- on a line. Goes through the very same code path as the numpad
     * (updateSelectedOrderline) so that every restriction of the standard
     * Point of Sale and of other modules still applies.
     */
    async gpChangeQuantity(line, delta) {
        const quantity = line.get_quantity() + delta;
        if (quantity <= 0) {
            return this.gpRemoveLine(line);
        }
        this.selectLine(line);
        this.pos.numpadMode = "quantity";
        await this.updateSelectedOrderline({
            buffer: this.gpFormatQuantity(quantity),
            key: delta > 0 ? "+" : "-",
        });
        this.numberBuffer.reset();
    },
    async gpRemoveLine(line) {
        this.selectLine(line);
        this.pos.numpadMode = "quantity";
        await this.updateSelectedOrderline({ buffer: null, key: "Backspace" });
        this.numberBuffer.reset();
    },

    // ------------------------------------------------------------------
    // Totals
    // ------------------------------------------------------------------
    get gpSummary() {
        return gpOrderSummary(this.currentOrder, this.env);
    },
});
