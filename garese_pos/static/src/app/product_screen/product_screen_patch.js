import { patch } from "@web/core/utils/patch";
import { useExternalListener } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { OrderSummary } from "@point_of_sale/app/screens/product_screen/order_summary/order_summary";
import { Orderline } from "@point_of_sale/app/components/orderline/orderline";
import { ask } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { GpCalculator } from "@garese_pos/app/calculator/calculator";
import { GpCatalog } from "@garese_pos/app/catalog/catalog";
import { GpCartButtons } from "@garese_pos/app/product_screen/cart_buttons";
import { GpCustomerCard } from "@garese_pos/app/customer_card/customer_card";
import { GpSuggestions } from "@garese_pos/app/product_screen/suggestions";
import { gpOrderSummary } from "@garese_pos/app/utils/order_summary";

ProductScreen.components = {
    ...ProductScreen.components,
    GpCalculator,
    GpCatalog,
    GpCartButtons,
    GpCustomerCard,
    GpSuggestions,
};
Orderline.props = { ...Orderline.props, gp: { type: Object, optional: true } };

patch(ProductScreen.prototype, {
    setup() {
        super.setup(...arguments);
        // The hotkey service does not accept function keys: plain listener.
        // F2: search, F4: payment, F6: recent customers
        useExternalListener(window, "keydown", (ev) => {
            if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey) {
                return;
            }
            const actions = {
                F2: () => {
                    const input = document.querySelector(".pos-topheader .pos-rightheader input");
                    if (input) {
                        input.focus();
                        input.select();
                    }
                },
                F4: () => {
                    if (this.currentOrder && !this.currentOrder.isEmpty()) {
                        this.pos.pay();
                    }
                },
                F6: () => this.pos.gpPickRecentCustomer(),
            };
            const action = actions[ev.key];
            if (action && !document.querySelector(".modal")) {
                ev.preventDefault();
                action();
            }
        });
    },
    /** The GARESE layout is for tablets in landscape and desktops. */
    get gpLayout() {
        return !this.pos.isSmallProductScreen;
    },
    // ------------------------------------------------------------------
    // Cart header
    // ------------------------------------------------------------------
    get gpItemCount() {
        const lines = this.currentOrder?.lines || [];
        return lines.filter((line) => !line.combo_parent_id).length;
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
        const confirmed = await ask(this.dialog, {
            title: _t("Empty the cart?"),
            body: _t("All the lines of the current order will be removed."),
            confirmLabel: _t("Empty"),
        });
        if (!confirmed) {
            return;
        }
        // removeOrderline also drops the children of a combo: always take the
        // first remaining line instead of iterating on a stale list.
        let guard = order.lines.length + 1;
        while (order.lines.length && guard-- > 0) {
            order.removeOrderline(order.lines[0]);
        }
        this.numberBuffer.reset();
        this.pos.numpadMode = "quantity";
    },
    // ------------------------------------------------------------------
    // Totals
    // ------------------------------------------------------------------
    get gpSummary() {
        return gpOrderSummary(this.currentOrder, this.env);
    },
    get gpSelectedTemplate() {
        const order = this.currentOrder;
        const line = order?.getSelectedOrderline() || order?.lines?.at(-1);
        return line?.product_id?.product_tmpl_id || false;
    },
});

// ----------------------------------------------------------------------
// Cart lines: picture, +/- and delete, through the numpad pipeline so that
// every restriction (standard and other modules) still applies.
// ----------------------------------------------------------------------
patch(OrderSummary.prototype, {
    gpLineData(line) {
        if (this.pos.isSmallProductScreen) {
            return undefined;
        }
        const product = line.product_id;
        const promo =
            line.price_type === "original" && !line.is_reward_line && line.order_id?.pricelist_id
                ? product?.product_tmpl_id?.gpPromoFor(line.order_id.pricelist_id)
                : false;
        return {
            imageUrl:
                (this.pos.config.show_product_images &&
                    product?.product_tmpl_id?.image_128 &&
                    product.product_tmpl_id.getImageUrl()) ||
                false,
            canStep: this.gpCanStep(line),
            unitLabel: product?.to_weight ? line.product_id.uom_id?.name || "" : "",
            qtyLabel: this.gpQuantityLabel(line),
            unitPrice: this.env.utils.formatCurrency(line.displayPriceUnit),
            promo: promo ? { percent: promo.percent } : false,
            onPlus: () => this.gpChangeQuantity(line, 1),
            onMinus: () => this.gpChangeQuantity(line, -1),
            onRemove: () => this.gpRemoveLine(line),
        };
    },
    gpCanStep(line) {
        return !(
            line.combo_parent_id ||
            line.refunded_orderline_id ||
            line.is_reward_line ||
            line.isTipLine() ||
            line.qty < 0
        );
    },
    gpQuantityLabel(line) {
        const quantity = line.qty;
        return Number.isInteger(quantity) ? String(quantity) : line.quantityStr;
    },
    gpFormatQuantity(quantity) {
        const rounded = Number(quantity.toFixed(3));
        return String(rounded).replace(".", this.env.services.localization.decimalPoint);
    },
    async gpChangeQuantity(line, delta) {
        const quantity = line.qty + delta;
        if (quantity <= 0) {
            return this.gpRemoveLine(line);
        }
        this.currentOrder.selectOrderline(line);
        this.pos.numpadMode = "quantity";
        this.numberBuffer.reset();
        await this.updateSelectedOrderline({
            buffer: this.gpFormatQuantity(quantity),
            key: delta > 0 ? "+" : "-",
        });
        this.numberBuffer.reset();
    },
    async gpRemoveLine(line) {
        this.currentOrder.selectOrderline(line);
        this.pos.numpadMode = "quantity";
        this.numberBuffer.reset();
        await this.updateSelectedOrderline({ buffer: null, key: "Backspace" });
        this.numberBuffer.reset();
    },
});
